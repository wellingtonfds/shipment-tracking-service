import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateShipmentStatusDto {
  @ApiProperty({
    example: 'IN_TRANSIT',
    description:
      'New status (case-insensitive; must follow the linear flow CREATED -> IN_TRANSIT -> TRANSFERRED -> DELIVERED)',
  })
  @IsString()
  @IsNotEmpty()
  status!: string;

  @ApiProperty({
    example: 'Campinas, SP',
    description: 'Current location text after the update',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  locationText!: string;

  @ApiProperty({
    example: -22.9056,
    description: 'Current latitude (-90 to 90)',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiProperty({
    example: -47.0608,
    description: 'Current longitude (-180 to 180)',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiProperty({
    example: 'Left origin facility',
    description: 'Optional occurrence notes',
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({
    example: '2026-09-22T15:00:00.000Z',
    description:
      'Instante da ocorrência em ISO 8601; por padrão usa o recebimento UTC no servidor',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
