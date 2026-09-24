import { DomainError } from '../../shared/errors/domain.error.js';

export class GeocodingResultNotFoundError extends DomainError {
  constructor() {
    super('GEOCODING_RESULT_NOT_FOUND', 'No coordinates found for address');
  }
}
