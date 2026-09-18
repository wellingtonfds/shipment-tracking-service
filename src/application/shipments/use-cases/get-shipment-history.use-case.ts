import { TenantPrincipal } from '../../../domain/shipments/shipment.entity.js';
import { PaginatedShipmentEvents, ShipmentRepositoryPort } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { assertLimit, assertPage, loadScopedShipment, paginate } from './shipment-access.js';

const MAX_PAGE_SIZE = 100;

export interface GetShipmentHistoryRequest {
  readonly cargoCode: string;
  readonly page?: number;
  readonly limit?: number;
  readonly principal: TenantPrincipal;
}

export class GetShipmentHistoryUseCase {
  constructor(private readonly repository: ShipmentRepositoryPort) {}

  async execute(request: GetShipmentHistoryRequest): Promise<PaginatedShipmentEvents> {
    const shipment = await loadScopedShipment(this.repository, request.cargoCode, request.principal);
    const page = assertPage(request.page);
    const limit = assertLimit(request.limit, 100, MAX_PAGE_SIZE);

    const [data, total] = await Promise.all([this.repository.findEventsByShipment(shipment.id, page, limit), this.repository.countEventsByShipment(shipment.id)]);
    return paginate(data, total, page, limit);
  }
}
