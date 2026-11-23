import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@bayadrent/shared-types';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../db/db.constants';
import type { Database } from '../db';
import { users } from '../db/schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { AuthUser, JwtPayload } from './types';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jwt: JwtService,
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
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return this.getProfile(userId);
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
