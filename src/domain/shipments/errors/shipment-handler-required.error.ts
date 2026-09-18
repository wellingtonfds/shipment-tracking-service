import { DomainError } from '../../shared/errors/domain.error.js';

export class ShipmentHandlerRequiredError extends DomainError {
  constructor(message = 'Shipment handler must be an active OPERATOR linked to the shipment customer') {
    super('SHIPMENT_HANDLER_REQUIRED', message);
  }
}
