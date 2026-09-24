import { InvalidGeocodingAddressError } from '../../../domain/shipments/errors/invalid-geocoding-address.error.js';
import type {
  GeocodingCoordinates,
  GeocodingPort,
} from '../ports/geocoding.port.js';

export class GeocodeAddressUseCase {
  constructor(private readonly geocoder: GeocodingPort) {}

  async execute(address: string): Promise<GeocodingCoordinates> {
    const normalized = address.trim();
    if (normalized.length < 3 || normalized.length > 255) {
      throw new InvalidGeocodingAddressError();
    }
    return this.geocoder.geocode(normalized);
  }
}
