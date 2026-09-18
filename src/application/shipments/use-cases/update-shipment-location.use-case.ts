import { ShipmentWithLocation, TenantPrincipal, assertCanManageShipments, validateShipmentLocation } from '../../../domain/shipments/shipment.entity.js';
import { ShipmentRepositoryPort } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { loadScopedShipment } from './shipment-access.js';

export interface UpdateShipmentLocationRequest {
  readonly cargoCode: string;
  readonly locationText: string;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly notes?: string | null;
  readonly principal: TenantPrincipal;
}

export class UpdateShipmentLocationUseCase {
  constructor(private readonly repository: ShipmentRepositoryPort) {}

  async execute(request: UpdateShipmentLocationRequest): Promise<ShipmentWithLocation> {
    assertCanManageShipments(request.principal);
    const location = validateShipmentLocation({ locationText: request.locationText, latitude: request.latitude, longitude: request.longitude, notes: request.notes });

    const shipment = await loadScopedShipment(this.repository, request.cargoCode, request.principal);

    // Append-only: recording a location never rewrites the shipment row.
    // The new event becomes the cargo's current location.
    await this.repository.createEvent({
      shipmentId: shipment.id,
      status: shipment.status,
      occurredAt: new Date(),
      locationText: location.locationText,
      latitude: location.latitude,
      longitude: location.longitude,
      notes: location.notes,
      createdById: request.principal.userId,
    });
    return {
      ...shipment,
      currentLocation: { locationText: location.locationText, latitude: location.latitude, longitude: location.longitude },
    };
  }
}
