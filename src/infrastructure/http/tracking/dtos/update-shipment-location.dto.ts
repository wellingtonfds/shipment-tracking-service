import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateShipmentLocationDto {
  @ApiProperty({ example: 'Maceió, AL', description: 'Current location text (basic location update; no external geocoding)', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  locationText!: string;

  @ApiProperty({ example: -9.6658, description: 'Current latitude (-90 to 90)', required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiProperty({ example: -35.7353, description: 'Current longitude (-180 to 180)', required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiProperty({ example: 'GPS ping at hub', description: 'Optional occurrence notes', required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
