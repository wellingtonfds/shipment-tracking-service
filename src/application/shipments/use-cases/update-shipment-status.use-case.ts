import {
  TenantPrincipal,
  assertCanManageShipments,
  normalizeStatus,
  validateShipmentLocation,
} from '../../../domain/shipments/shipment.entity.js';
import { ShipmentRepositoryPort } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { loadScopedShipment } from './shipment-access.js';

export interface UpdateShipmentStatusRequest {
  readonly cargoCode: string;
  readonly status: string;
  readonly locationText: string;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly notes?: string | null;
  readonly occurredAt?: Date;
  readonly principal: TenantPrincipal;
}

export class UpdateShipmentStatusUseCase {
  constructor(private readonly repository: ShipmentRepositoryPort) {}

  async execute(
    request: UpdateShipmentStatusRequest,
  ): Promise<{ eventId: string; acceptedAt: Date; duplicate: false }> {
    assertCanManageShipments(request.principal);
    const location = validateShipmentLocation({
      locationText: request.locationText,
      latitude: request.latitude,
      longitude: request.longitude,
      notes: request.notes,
    });
    const nextStatus = normalizeStatus(request.status);

    const current = await loadScopedShipment(
      this.repository,
      request.cargoCode,
      request.principal,
    );
    const occurredAt = request.occurredAt ?? new Date();
    const accepted = await this.repository.acceptTrackingUpdate({
      shipmentId: current.id,
      eventType: 'STATUS',
      occurredAt,
      payload: JSON.stringify({
        status: nextStatus,
        locationText: location.locationText,
        latitude: location.latitude,
        longitude: location.longitude,
        notes: location.notes,
        createdById: request.principal.userId,
        occurredAt: occurredAt.toISOString(),
      }),
    });
    return {
      eventId: accepted.id,
      acceptedAt: accepted.acceptedAt,
      duplicate: false,
    };
  }
}
