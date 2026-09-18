import { InvalidShipmentError, TenantPrincipal, normalizeStatus } from '../../../domain/shipments/shipment.entity.js';
import { PaginatedShipmentEvents, ShipmentEventFilters, ShipmentRepositoryPort } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { AccessDeniedError } from '../../../domain/users/errors/access-denied.error.js';
import { assertLimit, assertPage, paginate } from './shipment-access.js';

const MAX_PAGE_SIZE = 100;

export interface ListShipmentEventsRequest {
  readonly page?: number;
  readonly limit?: number;
  readonly status?: string;
  readonly shipmentId?: number | null;
  readonly occurredFrom?: Date;
  readonly occurredTo?: Date;
  readonly principal: TenantPrincipal;
}

export class ListShipmentEventsUseCase {
  constructor(private readonly repository: ShipmentRepositoryPort) {}

  async execute(request: ListShipmentEventsRequest): Promise<PaginatedShipmentEvents> {
    if (request.principal.role !== 'ADMINISTRATOR') {
      throw new AccessDeniedError('Global history is restricted to ADMINISTRATOR');
    }
    if (request.occurredFrom === undefined && request.occurredTo === undefined) {
      throw new InvalidShipmentError('History listing requires a time window (occurredFrom or occurredTo)');
    }
    const page = assertPage(request.page);
    const limit = assertLimit(request.limit, 10, MAX_PAGE_SIZE);
    const status = request.status === undefined ? undefined : normalizeStatus(request.status);

    const filters: ShipmentEventFilters = {
      ...(request.shipmentId !== undefined && request.shipmentId !== null ? { shipmentId: request.shipmentId } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(request.occurredFrom !== undefined ? { occurredFrom: request.occurredFrom } : {}),
      ...(request.occurredTo !== undefined ? { occurredTo: request.occurredTo } : {}),
    };

    const [data, total] = await Promise.all([this.repository.findEvents(filters, page, limit), this.repository.countEvents(filters)]);
    return paginate(data, total, page, limit);
  }
}
