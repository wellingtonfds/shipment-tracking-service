import { DomainError } from '../../shared/errors/domain.error.js';

export class InvalidGeocodingAddressError extends DomainError {
  constructor() {
    super(
      'GEOCODING_INVALID_ADDRESS',
      'Address must contain between 3 and 255 characters',
    );
  }
}
