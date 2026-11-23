import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateUnitDto {
  @ApiProperty({ example: 'Unit 2B' })
  @IsString()
  @MinLength(1)
  label!: string;
}
