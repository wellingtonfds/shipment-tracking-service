import { DomainError } from '../../shared/errors/domain.error.js';

export class ShipmentInvalidTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super('SHIPMENT_INVALID_TRANSITION', `Cannot transition shipment from ${from} to ${to}`);
  }
}
