import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private fromAddress: string;

  constructor(private readonly config: ConfigService) {
    this.fromAddress = this.config.get<string>('SMTP_FROM') ?? 'BayadRent <noreply@bayadrent.local>';
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        auth:
          this.config.get<string>('SMTP_USER') && this.config.get<string>('SMTP_PASS')
            ? {
                user: this.config.get<string>('SMTP_USER')!,
                pass: this.config.get<string>('SMTP_PASS')!,
              }
            : undefined,
      });
      this.logger.log(`SMTP mailer configured for ${host}`);
    } else {
      this.logger.log('SMTP_HOST not set — emails log to console only');
    }
  }

  async send(to: string, subject: string, text: string, html?: string) {
    if (!this.transporter) {
      this.logger.log(`[email] to=${to} subject="${subject}" body="${text}"`);
      return { delivered: false, channel: 'log' as const };
    }

    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      subject,
      text,
      html:
        html ??
        `<div style="font-family:Georgia,serif;color:#171c1a;line-height:1.5">
          <p>${text.replace(/\n/g, '<br/>')}</p>
          <p style="color:#5f6b65;font-size:0.9rem">— BayadRent</p>
        </div>`,
    });
    return { delivered: true, channel: 'smtp' as const };
  }
}
