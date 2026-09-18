import { InvalidShipmentError, ShipmentWithLocation, TenantPrincipal, applyTenantScope, normalizeStatus } from '../../../domain/shipments/shipment.entity.js';
import { PaginatedShipments, ShipmentListFilters, ShipmentOrderField as OrderField, ShipmentRepositoryPort, SortOrder as PortSortOrder } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { SHIPMENT_ORDER_FIELDS } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { assertLimit, assertPage, paginate } from './shipment-access.js';

const MAX_PAGE_SIZE = 100;

export interface ListShipmentsRequest {
  readonly page?: number;
  readonly limit?: number;
  readonly orderBy?: string;
  readonly order?: string;
  readonly status?: string;
  readonly customerId?: number | null;
  readonly handledById?: number | null;
  readonly departureFrom?: Date;
  readonly departureTo?: Date;
  readonly estimatedFrom?: Date;
  readonly estimatedTo?: Date;
  readonly principal: TenantPrincipal;
}

export class ListShipmentsUseCase {
  constructor(private readonly repository: ShipmentRepositoryPort) {}

  async execute(request: ListShipmentsRequest): Promise<PaginatedShipments> {
    const page = assertPage(request.page);
    const limit = assertLimit(request.limit, 10, MAX_PAGE_SIZE);
    const orderBy = this.assertOrderBy(request.orderBy);
    const order = this.assertOrder(request.order);
    const status = request.status === undefined ? undefined : normalizeStatus(request.status);

    // Tenant scope from the token always wins over the idCliente filter.
    const scope = applyTenantScope(request.principal);
    const filters: ShipmentListFilters = {
      ...(status !== undefined ? { status } : {}),
      ...(scope !== null ? { customerId: scope, customerScopeId: scope } : request.customerId !== undefined && request.customerId !== null ? { customerId: request.customerId } : {}),
      ...(request.handledById !== undefined && request.handledById !== null ? { handledById: request.handledById } : {}),
      ...(request.departureFrom !== undefined ? { departureFrom: request.departureFrom } : {}),
      ...(request.departureTo !== undefined ? { departureTo: request.departureTo } : {}),
      ...(request.estimatedFrom !== undefined ? { estimatedFrom: request.estimatedFrom } : {}),
      ...(request.estimatedTo !== undefined ? { estimatedTo: request.estimatedTo } : {}),
    };

    const [data, total] = await Promise.all([this.repository.findMany({ page, limit, orderBy, order, filters }), this.repository.count(filters)]);
    // Current location per shipment comes from the latest event (single grouped query, no N+1).
    const locations = await this.repository.findLatestLocations(data.map((shipment) => shipment.id));
    const withLocation: ShipmentWithLocation[] = data.map((shipment) => ({ ...shipment, currentLocation: locations.get(shipment.id) ?? null }));
    return paginate(withLocation, total, page, limit);
  }

  private assertOrderBy(orderBy: string | undefined): OrderField {
    const value: OrderField = orderBy === undefined ? 'createdAt' : (orderBy as OrderField);
    if (!(SHIPMENT_ORDER_FIELDS as readonly string[]).includes(value)) {
      throw new InvalidShipmentError(`orderBy must be one of ${SHIPMENT_ORDER_FIELDS.join(', ')}`);
    }
    return value;
  }

  private assertOrder(order: string | undefined): PortSortOrder {
    const value: PortSortOrder = order === undefined ? 'desc' : (order as PortSortOrder);
    if (value !== 'asc' && value !== 'desc') {
      throw new InvalidShipmentError('order must be asc or desc');
    }
    return value;
  }
}
