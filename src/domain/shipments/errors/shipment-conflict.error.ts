import { DomainError } from '../../shared/errors/domain.error.js';
import type { Shipment } from '../shipment.entity.js';

export class ShipmentConflictError extends DomainError {
  readonly current: Shipment;

  constructor(current: Shipment) {
    super('SHIPMENT_CONFLICT', `Shipment ${current.cargoCode} was modified concurrently; retry the operation`);
    this.current = current;
  }
}
