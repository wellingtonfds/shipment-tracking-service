import { DomainError } from '../../shared/errors/domain.error.js';

export class ShipmentNotFoundError extends DomainError {
  constructor(cargoCode: string) {
    super('SHIPMENT_NOT_FOUND', `Shipment ${cargoCode} not found`);
  }
}
