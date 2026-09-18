import { ShipmentWithLocation, TenantPrincipal, assertCanManageShipments, assertTransition, normalizeStatus, validateShipmentLocation } from '../../../domain/shipments/shipment.entity.js';
import { ShipmentRepositoryPort } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { loadScopedShipment, retryOptimisticUpdate } from './shipment-access.js';

export interface UpdateShipmentStatusRequest {
  readonly cargoCode: string;
  readonly status: string;
  readonly locationText: string;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly notes?: string | null;
  readonly principal: TenantPrincipal;
}

export class UpdateShipmentStatusUseCase {
  constructor(private readonly repository: ShipmentRepositoryPort) {}

  async execute(request: UpdateShipmentStatusRequest): Promise<ShipmentWithLocation> {
    assertCanManageShipments(request.principal);
    const location = validateShipmentLocation({ locationText: request.locationText, latitude: request.latitude, longitude: request.longitude, notes: request.notes });
    const nextStatus = normalizeStatus(request.status);

    const current = await loadScopedShipment(this.repository, request.cargoCode, request.principal);
    assertTransition(current.status, nextStatus);

    const updated = await retryOptimisticUpdate(
      (latest) =>
        this.repository.updateStatusOnce({
          shipmentId: latest.id,
          expectedStatus: latest.status,
          expectedUpdatedAt: latest.updatedAt,
          nextStatus,
          locationText: location.locationText,
          latitude: location.latitude,
          longitude: location.longitude,
          notes: location.notes,
          createdById: request.principal.userId,
          deliveredAt: nextStatus === 'DELIVERED' ? new Date() : null,
        }),
      current,
      (latest) => assertTransition(latest.status, nextStatus),
    );
    // The written location is recorded in the new event, which is now the current location.
    return {
      ...updated,
      currentLocation: { locationText: location.locationText, latitude: location.latitude, longitude: location.longitude },
    };
  }
}
