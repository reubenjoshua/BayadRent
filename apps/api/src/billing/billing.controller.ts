import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@bayadrent/shared-types';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthUser } from '../auth/types';
import { BillingService } from './billing.service';
import { GenerateInvoicesDto } from './dto/generate-invoices.dto';
import { PartialPayDto } from './dto/partial-pay.dto';
import { UpdateInvoiceLinesDto } from './dto/update-invoice-lines.dto';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('tracker')
  @Roles(UserRole.LANDLORD)
  tracker(@CurrentUser() user: AuthUser) {
    return this.billing.getTracker(user.id);
  }

  @Post('generate')
  @Roles(UserRole.LANDLORD)
  generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateInvoicesDto) {
    return this.billing.generateForLandlord(user.id, dto);
  }

  @Get('my-invoices')
  @Roles(UserRole.RENTER)
  myInvoices(@CurrentUser() user: AuthUser) {
    return this.billing.getRenterInvoices(user.id);
  }

  @Get('my-calendar')
  @Roles(UserRole.RENTER)
  myCalendar(
    @CurrentUser() user: AuthUser,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.billing.getRenterCalendar(user.id, year, month);
  }

  @Patch('invoices/:invoiceId/lines')
  @Roles(UserRole.LANDLORD)
  updateLines(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: UpdateInvoiceLinesDto,
  ) {
    return this.billing.updateInvoiceLines(user.id, invoiceId, dto);
  }

  @Post('invoices/:invoiceId/mark-paid')
  @Roles(UserRole.LANDLORD)
  markPaid(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    return this.billing.markPaid(user.id, invoiceId);
  }

  @Post('invoices/:invoiceId/waive')
  @Roles(UserRole.LANDLORD)
  waive(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    return this.billing.waive(user.id, invoiceId);
  }

  @Post('invoices/:invoiceId/partial')
  @Roles(UserRole.LANDLORD)
  partial(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: PartialPayDto,
  ) {
    return this.billing.recordPartial(user.id, invoiceId, dto);
  }

  @Get('invoices/:invoiceId/receipt')
  @Roles(UserRole.LANDLORD, UserRole.RENTER)
  async receipt(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Res() res: Response,
  ) {
    const receipt = await this.billing.getReceipt(user.id, user.role, invoiceId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${receipt.filename}"`);
    res.send(receipt.html);
  }
}
