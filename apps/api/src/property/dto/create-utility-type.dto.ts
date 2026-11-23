import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateUtilityTypeDto {
  @ApiProperty({ example: 'Electricity' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'kWh', description: 'Unit for consumption (kWh, m³, …)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unitLabel?: string;

  @ApiPropertyOptional({ example: 15.06, description: 'Pesos per unit, e.g. Meralco ₱/kWh' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitRate?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
