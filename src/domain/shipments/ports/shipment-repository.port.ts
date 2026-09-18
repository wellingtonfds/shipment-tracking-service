import { NormalizedCreateShipment, Shipment, ShipmentEvent, ShipmentLocation, ShipmentStatus, ShipmentWithLocation } from '../shipment.entity.js';

export type ShipmentOrderField = 'createdAt' | 'departureDate' | 'estimatedDeliveryDate' | 'updatedAt' | 'status';

export const SHIPMENT_ORDER_FIELDS: readonly ShipmentOrderField[] = ['createdAt', 'departureDate', 'estimatedDeliveryDate', 'updatedAt', 'status'] as const;

export type SortOrder = 'asc' | 'desc';

export interface ShipmentListFilters {
  readonly status?: ShipmentStatus;
  readonly customerId?: number;
  readonly handledById?: number;
  readonly departureFrom?: Date;
  readonly departureTo?: Date;
  readonly estimatedFrom?: Date;
  readonly estimatedTo?: Date;
  /** Tenant scope forced from the auth token; overrides customerId when present. */
  readonly customerScopeId?: number | null;
}

export interface ShipmentListQuery {
  readonly page: number;
  readonly limit: number;
  readonly orderBy: ShipmentOrderField;
  readonly order: SortOrder;
  readonly filters: ShipmentListFilters;
}

export interface PaginatedShipments {
  readonly data: ShipmentWithLocation[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface CreateShipmentRecord extends NormalizedCreateShipment {
  readonly customerId: number;
  readonly handledById: number;
}

export interface ShipmentStatusUpdate {
  readonly shipmentId: number;
  readonly expectedStatus: ShipmentStatus;
  readonly expectedUpdatedAt: Date;
  readonly nextStatus: ShipmentStatus;
  readonly locationText: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly notes: string | null;
  readonly createdById: number | null;
  readonly deliveredAt: Date | null;
}

export interface CreateShipmentEventData {
  readonly shipmentId: number;
  readonly status: ShipmentStatus;
  readonly occurredAt?: Date;
  readonly locationText: string;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly notes?: string | null;
  readonly createdById?: number | null;
}

export interface ShipmentEventFilters {
  readonly shipmentId?: number;
  readonly status?: ShipmentStatus;
  readonly occurredFrom?: Date;
  readonly occurredTo?: Date;
}

export interface PaginatedShipmentEvents {
  readonly data: ShipmentEvent[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface ShipmentRepositoryPort {
  findMany(query: ShipmentListQuery): Promise<Shipment[]>;
  count(filters: ShipmentListFilters): Promise<number>;
  findByCargoCode(cargoCode: string): Promise<Shipment | null>;
  create(data: CreateShipmentRecord): Promise<Shipment>;
  /** Single optimistic attempt: status/deliveredAt update + history insert in one transaction. */
  updateStatusOnce(data: ShipmentStatusUpdate): Promise<Shipment>;
  deleteByCargoCode(cargoCode: string): Promise<void>;
  /** Location of the latest event (ordered by occurredAt DESC, id DESC), or null when empty. */
  findLatestLocation(shipmentId: number): Promise<ShipmentLocation | null>;
  /** Latest event location per shipment id (single grouped query, no N+1). */
  findLatestLocations(shipmentIds: number[]): Promise<Map<number, ShipmentLocation>>;
  findEventsByShipment(shipmentId: number, page: number, limit: number): Promise<ShipmentEvent[]>;
  countEventsByShipment(shipmentId: number): Promise<number>;
  findEvents(filters: ShipmentEventFilters, page: number, limit: number): Promise<ShipmentEvent[]>;
  countEvents(filters: ShipmentEventFilters): Promise<number>;
  createEvent(data: CreateShipmentEventData): Promise<ShipmentEvent>;
}
