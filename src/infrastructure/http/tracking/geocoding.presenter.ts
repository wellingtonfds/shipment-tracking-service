import { ApiProperty } from '@nestjs/swagger';
import type { GeocodingCoordinates } from '../../../application/shipments/ports/geocoding.port.js';

export class GeocodingPresenter {
  @ApiProperty({ example: -23.561414, description: 'Resolved latitude' })
  latitude!: number;

  @ApiProperty({ example: -46.655881, description: 'Resolved longitude' })
  longitude!: number;

  static fromCoordinates(
    coordinates: GeocodingCoordinates,
  ): GeocodingPresenter {
    return { ...coordinates };
  }
}
