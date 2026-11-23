import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class PartialPayDto {
  @ApiProperty({ example: 5000, description: 'Amount paid now in PHP' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  paidAmount!: number;
}
