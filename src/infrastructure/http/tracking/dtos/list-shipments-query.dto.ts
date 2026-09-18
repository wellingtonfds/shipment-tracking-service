import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SHIPMENT_ORDER_FIELDS } from '../../../../domain/shipments/ports/shipment-repository.port.js';
import { SHIPMENT_STATUSES } from '../../../../domain/shipments/shipment.entity.js';

export class ListShipmentsQueryDto {
  @ApiProperty({ example: 1, description: 'Page (starts at 1)', default: 1, minimum: 1, required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ example: 10, description: 'Items per page (1-100)', default: 10, minimum: 1, maximum: 100, required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @ApiProperty({ enum: [...SHIPMENT_STATUSES], example: 'IN_TRANSIT', description: 'Filter by current status (case-insensitive; unknown values are rejected by the domain)', required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ type: Number, example: 1, description: 'Filter by customer id (OPERATOR/CUSTOMER: overridden by the token scope)', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCliente?: number;

  @ApiProperty({ type: Number, example: 3, description: 'Filter by handler (operator) id', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idOperador?: number;

  @ApiProperty({ example: '2026-09-01T00:00:00.000Z', description: 'Departure date from (inclusive)', format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  embarqueDe?: string;

  @ApiProperty({ example: '2026-09-30T23:59:59.999Z', description: 'Departure date to (inclusive)', format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  embarqueAte?: string;

  @ApiProperty({ example: '2026-09-01T00:00:00.000Z', description: 'Estimated delivery date from (inclusive)', format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  entregaDe?: string;

  @ApiProperty({ example: '2026-10-31T23:59:59.999Z', description: 'Estimated delivery date to (inclusive)', format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  entregaAte?: string;

  @ApiProperty({ enum: [...SHIPMENT_ORDER_FIELDS], example: 'createdAt', description: 'Sort field', required: false })
  @IsOptional()
  @IsIn([...SHIPMENT_ORDER_FIELDS])
  orderBy?: string;

  @ApiProperty({ enum: ['asc', 'desc'], example: 'desc', description: 'Sort direction', required: false })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: string;
}
