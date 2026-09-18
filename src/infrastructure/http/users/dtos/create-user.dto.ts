import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { USER_ROLES } from '../../../../domain/users/user.entity.js';

export class CreateUserDto {
  @ApiProperty({ example: 'Sergio Nogueira', description: 'User full name (2-120 characters)', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'sergio.nogueira@logistica.com', description: 'Unique user email', format: 'email' })
  @IsEmail({}, { message: 'invalid email' })
  @MaxLength(160)
  email!: string;

  @ApiProperty({ example: 'Senha123!', description: 'Password (at least 8 characters)', minLength: 8, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: [...USER_ROLES], example: 'OPERATOR', description: 'Access profile (CUSTOMER requires customerId)' })
  @IsString()
  @IsIn([...USER_ROLES])
  role!: string;

  @ApiProperty({ example: true, description: 'Whether the user can authenticate', default: true, required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ type: Number, nullable: true, example: null, description: 'Linked customer id (required for CUSTOMER, forbidden otherwise)', required: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === null ? null : Number(value)))
  @IsInt()
  @Min(1)
  customerId?: number | null;
}
