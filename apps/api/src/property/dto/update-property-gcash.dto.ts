import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePropertyGcashDto {
  @ApiPropertyOptional({ example: 'Juan Dela Cruz' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  gcashAccountName?: string;

  @ApiPropertyOptional({ example: '09171234567' })
  @IsOptional()
  @IsString()
  @MinLength(11)
  @MaxLength(40)
  gcashMobileNumber?: string;
}
