import { ApiProperty } from '@nestjs/swagger';

export class ErrorPresenter {
  @ApiProperty({ type: Number, example: 404, description: 'HTTP status' })
  statusCode!: number;

  @ApiProperty({ example: 'CUSTOMER_NOT_FOUND', description: 'Error code' })
  code!: string;

  @ApiProperty({ example: 'Customer 99 not found', description: 'Human-readable error description' })
  message!: string;

  @ApiProperty({ example: '/api/v1/customers/99', description: 'Request path' })
  path!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-16T20:30:00.000Z', description: 'Error timestamp' })
  timestamp!: string;
}
