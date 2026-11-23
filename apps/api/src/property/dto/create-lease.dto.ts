import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateLeaseDto {
  @ApiProperty({ example: 'renter@bayadrent.local' })
  @IsEmail()
  renterEmail!: string;

  @ApiProperty({ example: 15000, description: 'Monthly rent in PHP pesos' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rentAmount!: number;

  @ApiProperty({ example: 5, description: 'Day of month rent is due (1-28)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  dueDay!: number;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: 'Notes for this lease' })
  @IsOptional()
  @IsString()
  notes?: string;
}
