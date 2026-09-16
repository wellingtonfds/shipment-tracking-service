import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClienteDto {
  @ApiProperty({ example: 'Maria Silva', description: 'Nome completo do cliente (2-120 caracteres)', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome!: string;

  @ApiProperty({ example: 'maria.silva@example.com', description: 'Email único do cliente', format: 'email' })
  @IsEmail({}, { message: 'email inválido' })
  @MaxLength(160)
  email!: string;

  @ApiProperty({ example: '(11) 98888-7777', description: 'Telefone com DDD (mínimo 8 caracteres)', minLength: 8, maxLength: 40 })
  @IsString()
  @MinLength(8)
  @MaxLength(40)
  telefone!: string;

  @ApiProperty({ example: 'Av. Paulista, 1000 - apto 42', description: 'Endereço completo (5-255 caracteres)', minLength: 5, maxLength: 255 })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  endereco!: string;
}
