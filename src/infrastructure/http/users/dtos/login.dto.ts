import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@logistica.com', description: 'User email', format: 'email' })
  @IsEmail({}, { message: 'invalid email' })
  email!: string;

  @ApiProperty({ example: 'Senha123!', description: 'User password', writeOnly: true })
  @IsString()
  password!: string;
}
