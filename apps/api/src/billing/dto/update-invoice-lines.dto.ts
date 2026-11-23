import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class InvoiceLineUpdateDto {
  @ApiProperty()
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({
    example: 120.5,
    description: 'Consumed units this month (utilities). Amount = round(unitRate × quantity).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({
    example: 15.06,
    description: 'Optional rate override for this invoice; defaults to property utility rate',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitRate?: number;

  @ApiPropertyOptional({ example: 'Electricity' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label?: string;
}

export class UpdateInvoiceLinesDto {
  @ApiProperty({ type: [InvoiceLineUpdateDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineUpdateDto)
  lines!: InvoiceLineUpdateDto[];
}
