import { ShipmentWithLocation, TenantPrincipal } from '../../../domain/shipments/shipment.entity.js';
import { ShipmentRepositoryPort } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { loadScopedShipment } from './shipment-access.js';

export class GetShipmentUseCase {
  constructor(private readonly repository: ShipmentRepositoryPort) {}

  async execute(cargoCode: string, principal: TenantPrincipal): Promise<ShipmentWithLocation> {
    const shipment = await loadScopedShipment(this.repository, cargoCode, principal);
    const currentLocation = await this.repository.findLatestLocation(shipment.id);
    return { ...shipment, currentLocation };
  }
}
