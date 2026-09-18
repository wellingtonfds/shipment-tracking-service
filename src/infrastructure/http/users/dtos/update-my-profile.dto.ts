import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Self-service profile update: never includes role, active or customerId. */
export class UpdateMyProfileDto {
  @ApiProperty({ example: 'Sergio Nogueira', description: 'User full name (2-120 characters)', minLength: 2, maxLength: 120, required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiProperty({ example: 'sergio.nogueira@logistica.com', description: 'Unique user email', format: 'email', required: false })
  @IsOptional()
  @IsEmail({}, { message: 'invalid email' })
  @MaxLength(160)
  email?: string;

  @ApiProperty({ example: 'NovaSenha123!', description: 'New password (at least 8 characters)', minLength: 8, required: false, writeOnly: true })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}
