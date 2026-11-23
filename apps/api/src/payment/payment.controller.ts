import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@bayadrent/shared-types';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthUser } from '../auth/types';
import { proofFileFilter, proofStorage } from './payment-storage';
import { PaymentService } from './payment.service';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Get('pending')
  @Roles(UserRole.LANDLORD)
  pending(@CurrentUser() user: AuthUser) {
    return this.payments.listPendingForLandlord(user.id);
  }

  @Post('invoices/:invoiceId/submit')
  @Roles(UserRole.RENTER)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        note: { type: 'string' },
        proof: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('proof', {
      storage: proofStorage,
      fileFilter: proofFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  submit(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @UploadedFile() proof: Express.Multer.File | undefined,
    @Body('note') note?: string,
  ) {
    return this.payments.submitProof(user.id, invoiceId, { note, file: proof });
  }

  @Post(':paymentId/confirm')
  @Roles(UserRole.LANDLORD)
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.payments.confirm(user.id, paymentId);
  }

  @Post(':paymentId/reject')
  @Roles(UserRole.LANDLORD)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.payments.reject(user.id, paymentId);
  }

  @Get(':paymentId/proof')
  @Roles(UserRole.LANDLORD, UserRole.RENTER)
  async proof(
    @CurrentUser() user: AuthUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.payments.getProofFile(
      { id: user.id, role: user.role },
      paymentId,
    );
    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `inline; filename="${result.filename}"`,
    });
    return result.file;
  }
}
