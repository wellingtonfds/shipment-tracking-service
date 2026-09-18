import { DomainError } from '../../shared/errors/domain.error.js';

export class ShipmentInvalidDatesError extends DomainError {
  constructor(message: string) {
    super('SHIPMENT_INVALID_DATES', message);
  }
}
