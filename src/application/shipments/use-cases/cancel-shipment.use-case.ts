import { TenantPrincipal, assertCanManageShipments } from '../../../domain/shipments/shipment.entity.js';
import { ShipmentRepositoryPort } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { loadScopedShipment } from './shipment-access.js';

export class CancelShipmentUseCase {
  constructor(private readonly repository: ShipmentRepositoryPort) {}

  async execute(cargoCode: string, principal: TenantPrincipal): Promise<void> {
    assertCanManageShipments(principal);
    const shipment = await loadScopedShipment(this.repository, cargoCode, principal);
    await this.repository.deleteByCargoCode(shipment.cargoCode);
  }
}
