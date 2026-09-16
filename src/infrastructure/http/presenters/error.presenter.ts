import { ApiProperty } from '@nestjs/swagger';

export class ErrorPresenter {
  @ApiProperty({ type: Number, example: 404, description: 'Status HTTP' })
  statusCode!: number;

  @ApiProperty({ example: 'CLIENTE_NOT_FOUND', description: 'Código do erro' })
  code!: string;

  @ApiProperty({ example: 'Cliente 99 não encontrado', description: 'Descrição legível do erro' })
  message!: string;

  @ApiProperty({ example: '/api/v1/clientes/99', description: 'Path da request' })
  path!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-16T20:30:00.000Z', description: 'Momento do erro' })
  timestamp!: string;
}
