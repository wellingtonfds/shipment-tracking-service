import { ShipmentEvent, TenantPrincipal, assertCargoCode, normalizeStatus, parseDateInput, validateShipmentLocation } from '../../../domain/shipments/shipment.entity.js';
import { ShipmentRepositoryPort } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { ShipmentNotFoundError } from '../../../domain/shipments/errors/shipment-not-found.error.js';
import { AccessDeniedError } from '../../../domain/users/errors/access-denied.error.js';

export interface AddShipmentEventRequest {
  readonly cargoCode: string;
  readonly status?: string | null;
  readonly locationText: string;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly notes?: string | null;
  readonly occurredAt?: string | Date;
  readonly principal: TenantPrincipal;
}

export class AddShipmentEventUseCase {
  constructor(private readonly repository: ShipmentRepositoryPort) {}

  async execute(request: AddShipmentEventRequest): Promise<ShipmentEvent> {
    if (request.principal.role !== 'ADMINISTRATOR') {
      throw new AccessDeniedError('Manual history entries are restricted to ADMINISTRATOR');
    }
    const code = assertCargoCode(request.cargoCode);
    const shipment = await this.repository.findByCargoCode(code);
    if (!shipment) {
      throw new ShipmentNotFoundError(code);
    }

    const status = request.status === undefined || request.status === null ? shipment.status : normalizeStatus(request.status);
    const location = validateShipmentLocation({ locationText: request.locationText, latitude: request.latitude, longitude: request.longitude, notes: request.notes });
    const occurredAt = request.occurredAt === undefined ? new Date() : parseDateInput(request.occurredAt, 'occurredAt');

    const created: ShipmentEvent = await this.repository.createEvent({      shipmentId: shipment.id,
      status,
      occurredAt,
      locationText: location.locationText,
      latitude: location.latitude,
      longitude: location.longitude,
      notes: location.notes,
      createdById: request.principal.userId,
    });
    return created;
  }
}
