import { TenantPrincipal } from '../../../domain/shipments/shipment.entity.js';
import { PaginatedShipments } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { ListShipmentsRequest, ListShipmentsUseCase } from './list-shipments.use-case.js';

export class ListShipmentsByStatusUseCase {
  constructor(private readonly listShipments: ListShipmentsUseCase) {}

  async execute(status: string, request: Omit<ListShipmentsRequest, 'status'> & { principal: TenantPrincipal }): Promise<PaginatedShipments> {
    return this.listShipments.execute({ ...request, status });
  }
}
