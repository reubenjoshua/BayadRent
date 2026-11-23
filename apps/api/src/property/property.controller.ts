import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { gcashQrFileFilter, gcashQrStorage } from '../payment/payment-storage';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { CreatePropertyDto } from './dto/create-property.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { CreateUtilityTypeDto } from './dto/create-utility-type.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { UpdatePropertyGcashDto } from './dto/update-property-gcash.dto';
import { UpdateUtilityTypeDto } from './dto/update-utility-type.dto';
import { PropertyService } from './property.service';

@ApiTags('properties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class PropertyController {
  constructor(private readonly properties: PropertyService) {}

  @Post('properties')
  @Roles(UserRole.LANDLORD)
  createProperty(@CurrentUser() user: AuthUser, @Body() dto: CreatePropertyDto) {
    return this.properties.createProperty(user.id, dto);
  }

  @Get('properties')
  @Roles(UserRole.LANDLORD)
  listProperties(@CurrentUser() user: AuthUser) {
    return this.properties.listPropertiesForLandlord(user.id);
  }

  @Post('properties/:propertyId/units')
  @Roles(UserRole.LANDLORD)
  createUnit(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: CreateUnitDto,
  ) {
    return this.properties.createUnit(user.id, propertyId, dto);
  }

  @Post('units/:unitId/leases')
  @Roles(UserRole.LANDLORD)
  createLease(
    @CurrentUser() user: AuthUser,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body() dto: CreateLeaseDto,
  ) {
    return this.properties.createLease(user.id, unitId, dto);
  }

  @Post('units/:unitId/end-lease')
  @Roles(UserRole.LANDLORD)
  endLease(
    @CurrentUser() user: AuthUser,
    @Param('unitId', ParseUUIDPipe) unitId: string,
  ) {
    return this.properties.endLease(user.id, unitId);
  }

  @Patch('leases/:leaseId')
  @Roles(UserRole.LANDLORD)
  updateLease(
    @CurrentUser() user: AuthUser,
    @Param('leaseId', ParseUUIDPipe) leaseId: string,
    @Body() dto: UpdateLeaseDto,
  ) {
    return this.properties.updateLease(user.id, leaseId, dto);
  }

  @Post('properties/demo')
  @Roles(UserRole.LANDLORD)
  seedDemo(@CurrentUser() user: AuthUser) {
    return this.properties.seedDemo(user.id);
  }

  @Patch('properties/:propertyId/gcash')
  @Roles(UserRole.LANDLORD)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        gcashAccountName: { type: 'string' },
        gcashMobileNumber: { type: 'string' },
        qr: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('qr', {
      storage: gcashQrStorage,
      fileFilter: gcashQrFileFilter,
      limits: { fileSize: 3 * 1024 * 1024 },
    }),
  )
  updateGcash(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: UpdatePropertyGcashDto,
    @UploadedFile() qr?: Express.Multer.File,
  ) {
    return this.properties.updateGcash(user.id, propertyId, dto, qr);
  }

  @Get('properties/:propertyId/gcash-qr')
  @Roles(UserRole.LANDLORD, UserRole.RENTER)
  async gcashQr(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.properties.getGcashQrFile(
      { id: user.id, role: user.role },
      propertyId,
    );
    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `inline; filename="${result.filename}"`,
    });
    return result.file;
  }

  @Get('properties/:propertyId/utilities')
  @Roles(UserRole.LANDLORD)
  listUtilities(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    return this.properties.listUtilityTypes(user.id, propertyId);
  }

  @Post('properties/:propertyId/utilities')
  @Roles(UserRole.LANDLORD)
  createUtility(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: CreateUtilityTypeDto,
  ) {
    return this.properties.createUtilityType(user.id, propertyId, dto);
  }

  @Patch('utilities/:utilityTypeId')
  @Roles(UserRole.LANDLORD)
  updateUtility(
    @CurrentUser() user: AuthUser,
    @Param('utilityTypeId', ParseUUIDPipe) utilityTypeId: string,
    @Body() dto: UpdateUtilityTypeDto,
  ) {
    return this.properties.updateUtilityType(user.id, utilityTypeId, dto);
  }

  @Delete('utilities/:utilityTypeId')
  @Roles(UserRole.LANDLORD)
  deleteUtility(
    @CurrentUser() user: AuthUser,
    @Param('utilityTypeId', ParseUUIDPipe) utilityTypeId: string,
  ) {
    return this.properties.deleteUtilityType(user.id, utilityTypeId);
  }

  @Get('leases/me')
  @Roles(UserRole.RENTER)
  myLeases(@CurrentUser() user: AuthUser) {
    return this.properties.listLeasesForRenter(user.id);
  }
}
