import { DomainError } from '../../shared/errors/domain.error.js';

export class GeocodingProviderUnavailableError extends DomainError {
  constructor() {
    super(
      'GEOCODING_PROVIDER_UNAVAILABLE',
      'Geocoding provider is unavailable',
    );
  }
}
