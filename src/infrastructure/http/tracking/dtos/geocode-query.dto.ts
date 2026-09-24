import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class GeocodeQueryDto {
  @ApiProperty({
    example: 'Avenida Paulista, 1578, Bela Vista, São Paulo, SP, Brasil',
    description: 'Complete address to resolve',
    minLength: 3,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  address!: string;
}
