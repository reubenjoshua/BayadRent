import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreatePropertyDto {
  @ApiProperty({ example: 'Sunrise Apartments' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: '123 Mabini St, Quezon City' })
  @IsString()
  @MinLength(5)
  address!: string;
}
