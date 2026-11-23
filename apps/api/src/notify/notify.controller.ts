import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@bayadrent/shared-types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthUser } from '../auth/types';
import { NotifyService } from './notify.service';

@ApiTags('notify')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notify')
export class NotifyController {
  constructor(private readonly notify: NotifyService) {}

  @Get('inbox')
  @Roles(UserRole.LANDLORD, UserRole.RENTER)
  inbox(@CurrentUser() user: AuthUser) {
    return this.notify.listForUser(user.id);
  }

  @Post('inbox/read-all')
  @Roles(UserRole.LANDLORD, UserRole.RENTER)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notify.markAllRead(user.id);
  }

  @Post('inbox/:notificationId/read')
  @Roles(UserRole.LANDLORD, UserRole.RENTER)
  readOne(
    @CurrentUser() user: AuthUser,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notify.markRead(user.id, notificationId);
  }

  @Post('reminders/run')
  @Roles(UserRole.LANDLORD)
  runReminders(@CurrentUser() user: AuthUser) {
    return this.notify.enqueueReminders({
      landlordId: user.id,
      triggeredBy: user.id,
      force: true,
    });
  }
}
