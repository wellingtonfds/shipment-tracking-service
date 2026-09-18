import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SHIPMENT_STATUSES } from '../../../../domain/shipments/shipment.entity.js';

export class ListShipmentEventsQueryDto {
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

  @ApiProperty({ enum: [...SHIPMENT_STATUSES], example: 'DELIVERED', description: 'Filter by event status (case-insensitive; unknown values are rejected by the domain)', required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ type: Number, example: 5, description: 'Filter by shipment id', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCarga?: number;

  @ApiProperty({ example: '2026-09-01T00:00:00.000Z', description: 'Occurrence window start (inclusive). At least inicio or fim is required', format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  inicio?: string;

  @ApiProperty({ example: '2026-09-30T23:59:59.999Z', description: 'Occurrence window end (inclusive). At least inicio or fim is required', format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  fim?: string;
}
