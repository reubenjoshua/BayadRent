import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { NotifyController } from './notify.controller';
import { NotifyService } from './notify.service';

@Module({
  controllers: [NotifyController],
  providers: [NotifyService, MailService],
  exports: [NotifyService, MailService],
})
export class NotifyModule {}
