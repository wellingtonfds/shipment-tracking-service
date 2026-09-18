import { DomainError } from '../../shared/errors/domain.error.js';

export class ShipmentCargoCodeInUseError extends DomainError {
  constructor(cargoCode: string) {
    super('SHIPMENT_CARGO_CODE_IN_USE', `Cargo code ${cargoCode} is already in use`);
  }
}
