import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateShipmentDto {
  @ApiProperty({
    example: 'BR2026-0042',
    description: 'Unique cargo code (normalized to uppercase)',
    maxLength: 40,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  cargoCode!: string;

  @ApiProperty({
    example: 'São Paulo',
    description: 'Origin city',
    maxLength: 120,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  originCity!: string;

  @ApiProperty({
    example: 'Brasil',
    description: 'Origin country',
    maxLength: 80,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  originCountry!: string;

  @ApiProperty({
    example: 'Avenida Paulista, 1578, Bela Vista, São Paulo, SP, Brasil',
    description:
      'Complete origin address; coordinates are resolved by the backend',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  originAddress!: string;

  @ApiProperty({
    example: 'Rio de Janeiro',
    description: 'Destination city',
    maxLength: 120,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  destinationCity!: string;

  @ApiProperty({
    example: 'Brasil',
    description: 'Destination country',
    maxLength: 80,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  destinationCountry!: string;

  @ApiProperty({
    example: 'Avenida Atlântica, 1702, Copacabana, Rio de Janeiro, RJ, Brasil',
    description:
      'Complete destination address; coordinates are resolved by the backend',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  destinationAddress!: string;

  @ApiProperty({
    example: '2026-09-20T08:00:00.000Z',
    description: 'Departure (shipment) date',
    format: 'date-time',
  })
  @IsDateString()
  departureDate!: string;

  @ApiProperty({
    example: '2026-09-27T18:00:00.000Z',
    description:
      'Estimated delivery date (must be on/after departure and registration)',
    format: 'date-time',
  })
  @IsDateString()
  estimatedDeliveryDate!: string;

  @ApiProperty({
    type: Number,
    example: 1,
    description:
      'Customer id. ADMINISTRATOR only (required); OPERATOR input is ignored (token scope applies)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  customerId?: number;

  @ApiProperty({
    type: Number,
    example: 3,
    description:
      'Handler (operator) id. ADMINISTRATOR only (required, must be an active OPERATOR of the customer); OPERATOR input is ignored (handled by self)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  handledById?: number;
}
