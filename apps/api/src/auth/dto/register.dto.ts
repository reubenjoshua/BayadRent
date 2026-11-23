import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@bayadrent/shared-types';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'landlord@bayadrent.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Ana Landlord' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({ enum: [UserRole.LANDLORD, UserRole.RENTER], example: UserRole.LANDLORD })
  @IsIn([UserRole.LANDLORD, UserRole.RENTER])
  role!: UserRole;
}
