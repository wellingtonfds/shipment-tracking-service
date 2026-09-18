import { InvalidShipmentError, ShipmentWithLocation, TenantPrincipal, assertCanManageShipments, assertDeliverable, validateShipmentLocation } from '../../../domain/shipments/shipment.entity.js';
import { ShipmentRepositoryPort } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { loadScopedShipment, retryOptimisticUpdate } from './shipment-access.js';

export interface MarkShipmentDeliveredRequest {
  readonly cargoCode: string;
  readonly locationText?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly notes?: string | null;
  readonly principal: TenantPrincipal;
}

export class MarkShipmentDeliveredUseCase {
  constructor(private readonly repository: ShipmentRepositoryPort) {}

  async execute(request: MarkShipmentDeliveredRequest): Promise<ShipmentWithLocation> {
    assertCanManageShipments(request.principal);
    const current = await loadScopedShipment(this.repository, request.cargoCode, request.principal);
    assertDeliverable(current.status);

    const coordinatesSent = (request.latitude !== undefined && request.latitude !== null) || (request.longitude !== undefined && request.longitude !== null);
    if ((request.locationText === undefined || request.locationText === null) && coordinatesSent) {
      throw new InvalidShipmentError('locationText is required when sending coordinates');
    }
    // Without an explicit location, the delivery keeps the latest event location.
    const latest = request.locationText === undefined || request.locationText === null ? await this.repository.findLatestLocation(current.id) : null;
    const location = validateShipmentLocation({
      locationText: request.locationText ?? latest?.locationText ?? current.originCity,
      latitude: request.locationText === undefined || request.locationText === null ? (latest?.latitude ?? null) : (request.latitude ?? null),
      longitude: request.locationText === undefined || request.locationText === null ? (latest?.longitude ?? null) : (request.longitude ?? null),
      notes: request.notes,
    });

    const updated = await retryOptimisticUpdate(
      (latestShipment) =>
        this.repository.updateStatusOnce({
          shipmentId: latestShipment.id,
          expectedStatus: latestShipment.status,
          expectedUpdatedAt: latestShipment.updatedAt,
          nextStatus: 'DELIVERED',
          locationText: location.locationText,
          latitude: location.latitude,
          longitude: location.longitude,
          notes: location.notes,
          createdById: request.principal.userId,
          deliveredAt: new Date(),
        }),
      current,
      (latestShipment) => assertDeliverable(latestShipment.status),
    );
    return {
      ...updated,
      currentLocation: { locationText: location.locationText, latitude: location.latitude, longitude: location.longitude },
    };
  }
}
