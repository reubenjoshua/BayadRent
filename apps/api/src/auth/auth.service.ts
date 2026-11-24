import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@bayadrent/shared-types';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { and, eq, gt, isNotNull } from 'drizzle-orm';
import { DATABASE } from '../db/db.constants';
import type { Database } from '../db';
import { users } from '../db/schema';
import { MailService } from '../notify/mail.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { AuthUser, JwtPayload } from './types';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email.toLowerCase()),
    });

    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const [created] = await this.db
      .insert(users)
      .values({
        email: dto.email.toLowerCase(),
        passwordHash,
        fullName: dto.fullName.trim(),
        role: dto.role,
      })
      .returning({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
      });

    return this.toAuthResponse(created);
  }

  async login(dto: LoginDto) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email.toLowerCase()),
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.toAuthResponse({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });
  }

  async getProfile(userId: string): Promise<AuthUser> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phone: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        emailRemindersEnabled: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async updateProfile(
    userId: string,
    dto: {
      fullName?: string;
      phone?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      emailRemindersEnabled?: boolean;
    },
  ): Promise<AuthUser> {
    const existing = await this.getProfile(userId);

    await this.db
      .update(users)
      .set({
        fullName: dto.fullName !== undefined ? dto.fullName.trim() : existing.fullName,
        phone: dto.phone !== undefined ? dto.phone.trim() || null : existing.phone,
        emergencyContactName:
          dto.emergencyContactName !== undefined
            ? dto.emergencyContactName.trim() || null
            : existing.emergencyContactName,
        emergencyContactPhone:
          dto.emergencyContactPhone !== undefined
            ? dto.emergencyContactPhone.trim() || null
            : existing.emergencyContactPhone,
        emailRemindersEnabled:
          dto.emailRemindersEnabled !== undefined
            ? dto.emailRemindersEnabled
            : (existing.emailRemindersEnabled ?? true),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return this.getProfile(userId);
  }

  /** Always returns the same shape so emails can't be enumerated. */
  async forgotPassword(email: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (user) {
      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await this.db
        .update(users)
        .set({
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      const webOrigin = this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
      const resetUrl = `${webOrigin.replace(/\/$/, '')}/reset-password?token=${token}`;

      await this.mail.send(
        user.email,
        '[BayadRent] Reset your password',
        `Hi ${user.fullName},\n\nReset your password using this link (valid for 1 hour):\n${resetUrl}\n\nIf you didn't ask for this, you can ignore this email.\n\n— BayadRent`,
        `<div style="font-family:Georgia,serif;color:#171c1a;line-height:1.5">
          <p>Hi ${user.fullName},</p>
          <p><a href="${resetUrl}" style="color:#115e49;font-weight:600">Reset your password</a> — link expires in 1 hour.</p>
          <p style="color:#5f6b65;font-size:0.9rem">If you didn't ask for this, ignore this email.</p>
          <p style="color:#5f6b65;font-size:0.9rem">— BayadRent</p>
        </div>`,
      );
    }

    return {
      ok: true,
      message: 'If that email is registered, a reset link has been sent.',
    };
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const user = await this.db.query.users.findFirst({
      where: and(
        eq(users.passwordResetTokenHash, tokenHash),
        isNotNull(users.passwordResetExpiresAt),
        gt(users.passwordResetExpiresAt, new Date()),
      ),
    });

    if (!user) {
      throw new BadRequestException('Reset link is invalid or expired');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await this.db
      .update(users)
      .set({
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return { ok: true, message: 'Password updated. You can sign in now.' };
  }

  private toAuthResponse(user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
  }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }
}
