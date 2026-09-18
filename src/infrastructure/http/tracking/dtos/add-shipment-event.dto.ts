import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AddShipmentEventDto {
  @ApiProperty({ example: 'TRANSFERRED', description: 'Event status snapshot (case-insensitive; defaults to the current shipment status)', required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ example: 'Distribution hub, Maceió', description: 'Occurrence location text', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  locationText!: string;

  @ApiProperty({ example: -9.6658, description: 'Occurrence latitude (-90 to 90)', required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiProperty({ example: -35.7353, description: 'Occurrence longitude (-180 to 180)', required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiProperty({ example: 'Manual checkpoint by support', description: 'Optional occurrence notes', required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ example: '2026-09-17T14:30:00.000Z', description: 'Occurrence date/time (backdated entries allowed; defaults to now)', format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
