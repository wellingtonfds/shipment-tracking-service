import {
  TenantPrincipal,
  assertCanManageShipments,
  validateShipmentLocation,
} from '../../../domain/shipments/shipment.entity.js';
import { ShipmentRepositoryPort } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { loadScopedShipment } from './shipment-access.js';

export interface UpdateShipmentLocationRequest {
  readonly cargoCode: string;
  readonly locationText: string;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly notes?: string | null;
  readonly idempotencyKey: string;
  readonly occurredAt?: Date;
  readonly principal: TenantPrincipal;
}

export interface AcceptedTrackingUpdateResult {
  readonly eventId: string;
  readonly acceptedAt: Date;
  readonly duplicate: boolean;
}

export class UpdateShipmentLocationUseCase {
  constructor(private readonly repository: ShipmentRepositoryPort) {}

  async execute(
    request: UpdateShipmentLocationRequest,
  ): Promise<AcceptedTrackingUpdateResult> {
    assertCanManageShipments(request.principal);
    const location = validateShipmentLocation({
      locationText: request.locationText,
      latitude: request.latitude,
      longitude: request.longitude,
      notes: request.notes,
    });

    const shipment = await loadScopedShipment(
      this.repository,
      request.cargoCode,
      request.principal,
    );

    const occurredAt = request.occurredAt ?? new Date();
    const accepted = await this.repository.acceptTrackingUpdate({
      shipmentId: shipment.id,
      eventType: 'LOCATION',
      idempotencyKey: request.idempotencyKey,
      occurredAt,
      deduplicationPayload: JSON.stringify({
        locationText: location.locationText,
        latitude: location.latitude,
        longitude: location.longitude,
        notes: location.notes,
        createdById: request.principal.userId,
        occurredAt: request.occurredAt?.toISOString() ?? null,
      }),
      payload: JSON.stringify({
        status: shipment.status,
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
      duplicate: accepted.duplicate,
    };
  }
}
