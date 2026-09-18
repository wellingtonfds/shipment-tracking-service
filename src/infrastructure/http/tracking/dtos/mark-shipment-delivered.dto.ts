import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class MarkShipmentDeliveredDto {
  @ApiProperty({ example: 'Rio de Janeiro, RJ', description: 'Delivery location text (defaults to the current location)', required: false, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  locationText?: string;

  @ApiProperty({ example: -22.9068, description: 'Delivery latitude (requires locationText; must come with longitude)', required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiProperty({ example: -43.1729, description: 'Delivery longitude (requires locationText; must come with latitude)', required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiProperty({ example: 'Delivered to consignee', description: 'Optional final occurrence notes', required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
