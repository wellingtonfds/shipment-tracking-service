import { DomainError } from '../../shared/errors/domain.error.js';

export class ShipmentHandlerInactiveError extends DomainError {
  constructor(handlerId: number) {
    super('SHIPMENT_HANDLER_INACTIVE', `Shipment handler ${handlerId} is inactive`);
  }
}
