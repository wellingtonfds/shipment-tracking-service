import { describe, expect, it } from 'vitest';
import {
  Shipment,
  ShipmentEvent,
  ShipmentLocation,
  TenantPrincipal,
  assertTransition,
} from '../../../domain/shipments/shipment.entity.js';
import { ShipmentConflictError } from '../../../domain/shipments/errors/shipment-conflict.error.js';
import { ShipmentNotFoundError } from '../../../domain/shipments/errors/shipment-not-found.error.js';
import {
  CreateShipmentEventData,
  CreateShipmentRecord,
  ShipmentEventFilters,
  ShipmentListFilters,
  ShipmentListQuery,
  ShipmentRepositoryPort,
  ShipmentStatusUpdate,
} from '../../../domain/shipments/ports/shipment-repository.port.js';
import { Customer } from '../../../domain/customers/customer.entity.js';
import { CustomerRepositoryPort } from '../../../domain/customers/ports/customer-repository.port.js';
import { User } from '../../../domain/users/user.entity.js';
import {
  UserCredentials,
  UserRepositoryPort,
} from '../../../domain/users/ports/user-repository.port.js';
import { AddShipmentEventUseCase } from './add-shipment-event.use-case.js';
import { CancelShipmentUseCase } from './cancel-shipment.use-case.js';
import { CreateShipmentUseCase } from './create-shipment.use-case.js';
import { GetShipmentHistoryUseCase } from './get-shipment-history.use-case.js';
import { GetShipmentUseCase } from './get-shipment.use-case.js';
import { ListShipmentEventsUseCase } from './list-shipment-events.use-case.js';
import { ListShipmentsByStatusUseCase } from './list-shipments-by-status.use-case.js';
import { ListShipmentsUseCase } from './list-shipments.use-case.js';
import { MarkShipmentDeliveredUseCase } from './mark-shipment-delivered.use-case.js';
import { UpdateShipmentLocationUseCase } from './update-shipment-location.use-case.js';
import { UpdateShipmentStatusUseCase } from './update-shipment-status.use-case.js';
import { retryOptimisticUpdate } from './shipment-access.js';

const admin: TenantPrincipal = {
  userId: 1,
  role: 'ADMINISTRATOR',
  customerId: null,
};
const operator: TenantPrincipal = {
  userId: 2,
  role: 'OPERATOR',
  customerId: 1,
};
const otherOperator: TenantPrincipal = {
  userId: 3,
  role: 'OPERATOR',
  customerId: 2,
};
const portal: TenantPrincipal = { userId: 5, role: 'CUSTOMER', customerId: 1 };
const unlinkedPortal: TenantPrincipal = {
  userId: 9,
  role: 'CUSTOMER',
  customerId: null,
};

function future(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function baseCreateInput(cargoCode = 'UT-0001') {
  return {
    cargoCode,
    originCity: 'São Paulo',
    originCountry: 'Brasil',
    destinationCity: 'Rio de Janeiro',
    destinationCountry: 'Brasil',
    departureDate: future(1),
    estimatedDeliveryDate: future(6),
  };
}

interface FakeStore {
  repo: ShipmentRepositoryPort & {
    alwaysConflict: boolean;
    conflictOnNextUpdate: boolean;
  };
  shipments: Map<number, Shipment>;
  events: ShipmentEvent[];
}

function fakeShipments(): FakeStore {
  const shipments = new Map<number, Shipment>();
  const events: ShipmentEvent[] = [];
  const idempotency = new Map<
    string,
    { payload: string; id: string; acceptedAt: Date }
  >();
  let nextId = 1;
  let nextEventId = 1;
  let nextOutboxId = 1;

  const copy = (shipment: Shipment): Shipment => ({ ...shipment });

  function matchesFilters(
    shipment: Shipment,
    filters: ShipmentListFilters,
  ): boolean {
    const customerId = filters.customerScopeId ?? filters.customerId;
    if (filters.status !== undefined && shipment.status !== filters.status)
      return false;
    if (
      customerId !== undefined &&
      customerId !== null &&
      shipment.customerId !== customerId
    )
      return false;
    if (
      filters.handledById !== undefined &&
      shipment.handledById !== filters.handledById
    )
      return false;
    if (
      filters.departureFrom !== undefined &&
      shipment.departureDate.getTime() < filters.departureFrom.getTime()
    )
      return false;
    if (
      filters.departureTo !== undefined &&
      shipment.departureDate.getTime() > filters.departureTo.getTime()
    )
      return false;
    if (
      filters.estimatedFrom !== undefined &&
      shipment.estimatedDeliveryDate.getTime() < filters.estimatedFrom.getTime()
    )
      return false;
    if (
      filters.estimatedTo !== undefined &&
      shipment.estimatedDeliveryDate.getTime() > filters.estimatedTo.getTime()
    )
      return false;
    return true;
  }

  function sortShipments(
    rows: Shipment[],
    query: ShipmentListQuery,
  ): Shipment[] {
    const factor = query.order === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left =
        query.orderBy === 'status' ? a.status : a[query.orderBy].getTime();
      const right =
        query.orderBy === 'status' ? b.status : b[query.orderBy].getTime();
      if (left < right) return -1 * factor;
      if (left > right) return 1 * factor;
      return (a.id - b.id) * -1;
    });
  }

  function appendEvent(
    shipmentId: number,
    status: Shipment['status'],
    locationText: string,
    createdById: number | null,
    notes: string | null,
    latitude: number | null = null,
    longitude: number | null = null,
  ): void {
    events.push({
      id: nextEventId,
      shipmentId,
      status,
      occurredAt: new Date(),
      locationText,
      latitude,
      longitude,
      notes,
      createdById,
      createdAt: new Date(),
    });
    nextEventId += 1;
  }

  function latestEvent(shipmentId: number): ShipmentEvent | null {
    const rows = events
      .filter((event) => event.shipmentId === shipmentId)
      .sort(
        (a, b) =>
          b.occurredAt.getTime() - a.occurredAt.getTime() || b.id - a.id,
      );
    return rows[0] ?? null;
  }

  const repo: ShipmentRepositoryPort & {
    alwaysConflict: boolean;
    conflictOnNextUpdate: boolean;
  } = {
    alwaysConflict: false,
    conflictOnNextUpdate: false,

    async findMany(query: ShipmentListQuery): Promise<Shipment[]> {
      const rows = [...shipments.values()].filter((shipment) =>
        matchesFilters(shipment, query.filters),
      );
      return sortShipments(rows, query)
        .slice((query.page - 1) * query.limit, query.page * query.limit)
        .map(copy);
    },

    async count(filters: ShipmentListFilters): Promise<number> {
      return [...shipments.values()].filter((shipment) =>
        matchesFilters(shipment, filters),
      ).length;
    },

    async findByCargoCode(cargoCode: string): Promise<Shipment | null> {
      const found =
        [...shipments.values()].find(
          (shipment) => shipment.cargoCode === cargoCode,
        ) ?? null;
      return found ? copy(found) : null;
    },

    async create(data: CreateShipmentRecord): Promise<Shipment> {
      const now = new Date();
      const created: Shipment = {
        id: nextId,
        cargoCode: data.cargoCode,
        status: 'CREATED',
        originCity: data.originCity,
        originCountry: data.originCountry,
        originLatitude: data.originLatitude,
        originLongitude: data.originLongitude,
        destinationCity: data.destinationCity,
        destinationCountry: data.destinationCountry,
        destinationLatitude: data.destinationLatitude,
        destinationLongitude: data.destinationLongitude,
        geocodedAt: null,
        geocodeProvider: null,
        departureDate: data.departureDate,
        estimatedDeliveryDate: data.estimatedDeliveryDate,
        deliveredAt: null,
        customerId: data.customerId,
        handledById: data.handledById,
        createdAt: now,
        updatedAt: now,
      };
      shipments.set(nextId, created);
      nextId += 1;
      appendEvent(
        created.id,
        'CREATED',
        `${data.originCity}, ${data.originCountry}`,
        data.handledById,
        'Shipment registered in the system',
        data.originLatitude,
        data.originLongitude,
      );
      return copy(created);
    },

    async updateStatusOnce(data: ShipmentStatusUpdate): Promise<Shipment> {
      const stored = shipments.get(data.shipmentId);
      if (!stored) {
        throw new ShipmentNotFoundError(String(data.shipmentId));
      }
      if (repo.conflictOnNextUpdate) {
        // Another writer commits between our read and our write: only updatedAt moves.
        repo.conflictOnNextUpdate = false;
        shipments.set(data.shipmentId, {
          ...stored,
          updatedAt: new Date(stored.updatedAt.getTime() + 1000),
        });
      }
      const latest = shipments.get(data.shipmentId)!;
      if (
        repo.alwaysConflict ||
        latest.status !== data.expectedStatus ||
        latest.updatedAt.getTime() !== data.expectedUpdatedAt.getTime()
      ) {
        throw new ShipmentConflictError(copy(latest));
      }
      const updated: Shipment = {
        ...stored,
        status: data.nextStatus,
        deliveredAt: data.deliveredAt,
        updatedAt: new Date(),
      };
      shipments.set(data.shipmentId, updated);
      appendEvent(
        data.shipmentId,
        data.nextStatus,
        data.locationText,
        data.createdById,
        data.notes,
        data.latitude,
        data.longitude,
      );
      return copy(updated);
    },

    async deleteByCargoCode(cargoCode: string): Promise<void> {
      const found = [...shipments.values()].find(
        (shipment) => shipment.cargoCode === cargoCode,
      );
      if (!found) {
        throw new ShipmentNotFoundError(cargoCode);
      }
      shipments.delete(found.id);
      for (let i = events.length - 1; i >= 0; i -= 1) {
        if (events[i].shipmentId === found.id) {
          events.splice(i, 1);
        }
      }
    },

    async findLatestLocation(
      shipmentId: number,
    ): Promise<ShipmentLocation | null> {
      const latest = latestEvent(shipmentId);
      if (!latest) {
        return null;
      }
      return {
        locationText: latest.locationText,
        latitude: latest.latitude,
        longitude: latest.longitude,
      };
    },

    async findLatestLocations(
      shipmentIds: number[],
    ): Promise<Map<number, ShipmentLocation>> {
      const result = new Map<number, ShipmentLocation>();
      for (const shipmentId of shipmentIds) {
        const latest = latestEvent(shipmentId);
        if (latest) {
          result.set(shipmentId, {
            locationText: latest.locationText,
            latitude: latest.latitude,
            longitude: latest.longitude,
          });
        }
      }
      return result;
    },

    async findEventsByShipment(
      shipmentId: number,
      page: number,
      limit: number,
    ): Promise<ShipmentEvent[]> {
      return events
        .filter((event) => event.shipmentId === shipmentId)
        .sort(
          (a, b) =>
            b.occurredAt.getTime() - a.occurredAt.getTime() || b.id - a.id,
        )
        .slice((page - 1) * limit, page * limit)
        .map((event) => ({ ...event }));
    },

    async countEventsByShipment(shipmentId: number): Promise<number> {
      return events.filter((event) => event.shipmentId === shipmentId).length;
    },

    async findEvents(
      filters: ShipmentEventFilters,
      page: number,
      limit: number,
    ): Promise<ShipmentEvent[]> {
      return events
        .filter(
          (event) =>
            (filters.shipmentId === undefined ||
              event.shipmentId === filters.shipmentId) &&
            (filters.status === undefined || event.status === filters.status) &&
            (filters.occurredFrom === undefined ||
              event.occurredAt.getTime() >= filters.occurredFrom.getTime()) &&
            (filters.occurredTo === undefined ||
              event.occurredAt.getTime() <= filters.occurredTo.getTime()),
        )
        .sort(
          (a, b) =>
            b.occurredAt.getTime() - a.occurredAt.getTime() || b.id - a.id,
        )
        .slice((page - 1) * limit, page * limit)
        .map((event) => ({ ...event }));
    },

    async countEvents(filters: ShipmentEventFilters): Promise<number> {
      return events.filter(
        (event) =>
          (filters.shipmentId === undefined ||
            event.shipmentId === filters.shipmentId) &&
          (filters.status === undefined || event.status === filters.status) &&
          (filters.occurredFrom === undefined ||
            event.occurredAt.getTime() >= filters.occurredFrom.getTime()) &&
          (filters.occurredTo === undefined ||
            event.occurredAt.getTime() <= filters.occurredTo.getTime()),
      ).length;
    },

    async createEvent(data: CreateShipmentEventData): Promise<ShipmentEvent> {
      const created: ShipmentEvent = {
        id: nextEventId,
        shipmentId: data.shipmentId,
        status: data.status,
        occurredAt: data.occurredAt ?? new Date(),
        locationText: data.locationText,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        notes: data.notes ?? null,
        createdById: data.createdById ?? null,
        createdAt: new Date(),
      };
      events.push(created);
      nextEventId += 1;
      return { ...created };
    },

    async acceptTrackingUpdate(data) {
      const idemKey = data.idempotencyKey
        ? `${data.shipmentId}:${data.idempotencyKey}`
        : undefined;
      const dedupePayload = data.deduplicationPayload ?? data.payload;
      const prior = idemKey ? idempotency.get(idemKey) : undefined;
      if (prior) {
        if (prior.payload !== dedupePayload) {
          const error = new Error('IDEMPOTENCY_KEY_CONFLICT') as Error & {
            code: string;
          };
          error.code = 'IDEMPOTENCY_KEY_CONFLICT';
          throw error;
        }
        return { id: prior.id, acceptedAt: prior.acceptedAt, duplicate: true };
      }
      const id = `outbox-${nextOutboxId++}`;
      const acceptedAt = new Date();
      if (idemKey)
        idempotency.set(idemKey, { payload: dedupePayload, id, acceptedAt });
      const payload = JSON.parse(data.payload) as {
        status: Shipment['status'];
        locationText: string;
        latitude: number | null;
        longitude: number | null;
        notes: string | null;
        createdById: number;
      };
      if (data.eventType === 'STATUS') {
        const current = shipments.get(data.shipmentId)!;
        assertTransition(current.status, payload.status);
        await retryOptimisticUpdate(
          (latest) =>
            repo.updateStatusOnce({
              shipmentId: data.shipmentId,
              expectedStatus: latest.status,
              expectedUpdatedAt: latest.updatedAt,
              nextStatus: payload.status,
              locationText: payload.locationText,
              latitude: payload.latitude,
              longitude: payload.longitude,
              notes: payload.notes,
              createdById: payload.createdById,
              deliveredAt:
                payload.status === 'DELIVERED' ? data.occurredAt : null,
            }),
          current,
          (latest) => assertTransition(latest.status, payload.status),
        );
      } else {
        const current = shipments.get(data.shipmentId)!;
        await repo.createEvent({
          shipmentId: data.shipmentId,
          status: current.status,
          occurredAt: data.occurredAt,
          locationText: payload.locationText,
          latitude: payload.latitude,
          longitude: payload.longitude,
          notes: payload.notes,
          createdById: payload.createdById,
        });
      }
      return { id, acceptedAt, duplicate: false };
    },
  };

  return {
    repo,
    shipments,
    events,
  };
}

function fakeCustomers(): CustomerRepositoryPort {
  const customer: Customer = {
    id: 1,
    name: 'Maria Silva',
    email: 'maria.silva@example.com',
    phone: '(11) 98888-7777',
    address: 'Av. Paulista, 1000',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const other: Customer = {
    id: 2,
    name: 'João Souza',
    email: 'joao.souza@example.com',
    phone: '(21) 97777-6666',
    address: 'Rua do Ouvidor, 25',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
    async findMany() {
      return [customer, other];
    },
    async count() {
      return 2;
    },
    async findById(id: number) {
      if (id === customer.id) return customer;
      if (id === other.id) return other;
      return null;
    },
    async findByEmail() {
      return customer;
    },
    async create(data) {
      return { ...data, id: 3, createdAt: new Date(), updatedAt: new Date() };
    },
    async update(id: number, data) {
      return { ...customer, ...data, id };
    },
    async delete(): Promise<void> {
      return undefined;
    },
  };
}

function fakeUsers(): UserRepositoryPort {
  const now = new Date();
  const records = new Map<number, UserCredentials>([
    [
      1,
      {
        id: 1,
        name: 'Admin',
        email: 'admin@example.com',
        passwordHash: 'x',
        role: 'ADMINISTRATOR',
        active: true,
        customerId: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    [
      2,
      {
        id: 2,
        name: 'Operator',
        email: 'op@example.com',
        passwordHash: 'x',
        role: 'OPERATOR',
        active: true,
        customerId: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
    [
      3,
      {
        id: 3,
        name: 'Other Op',
        email: 'other-op@example.com',
        passwordHash: 'x',
        role: 'OPERATOR',
        active: true,
        customerId: 2,
        createdAt: now,
        updatedAt: now,
      },
    ],
    [
      4,
      {
        id: 4,
        name: 'Inactive Op',
        email: 'inactive@example.com',
        passwordHash: 'x',
        role: 'OPERATOR',
        active: false,
        customerId: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
    [
      5,
      {
        id: 5,
        name: 'Portal',
        email: 'portal@example.com',
        passwordHash: 'x',
        role: 'CUSTOMER',
        active: true,
        customerId: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
  ]);
  const toUser = (record: UserCredentials): User => {
    const { passwordHash: _passwordHash, ...user } = record;
    return user;
  };
  return {
    async findMany() {
      return [...records.values()].map(toUser);
    },
    async count() {
      return records.size;
    },
    async findById(id: number) {
      const record = records.get(id) ?? null;
      return record ? toUser(record) : null;
    },
    async findByEmail(email: string) {
      return (
        [...records.values()].find((record) => record.email === email) ?? null
      );
    },
    async create(data) {
      const created: UserCredentials = {
        ...data,
        id: records.size + 1,
        createdAt: now,
        updatedAt: now,
      };
      records.set(created.id, created);
      return toUser(created);
    },
    async update(id: number, data) {
      const current = records.get(id);
      if (!current) throw new Error('missing user in fake');
      const updated: UserCredentials = {
        ...current,
        ...data,
        id,
        updatedAt: new Date(),
      };
      records.set(id, updated);
      return toUser(updated);
    },
    async softDelete(id: number) {
      const current = records.get(id);
      if (!current) throw new Error('missing user in fake');
      const updated = { ...current, active: false };
      records.set(id, updated);
      return toUser(updated);
    },
  };
}

describe('CreateShipmentUseCase', () => {
  it('creates a shipment for the operator own customer, ignoring body ownership', async () => {
    const store = fakeShipments();
    const useCase = new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    );

    const shipment = await useCase.execute({
      ...baseCreateInput('ut-0001'),
      customerId: 2,
      handledById: 3,
      principal: operator,
    });

    expect(shipment.cargoCode).toBe('UT-0001');
    expect(shipment).toMatchObject({
      status: 'CREATED',
      customerId: 1,
      handledById: 2,
    });
    // The initial location is the origin, recorded in the CREATED event.
    expect(shipment.currentLocation).toMatchObject({
      locationText: 'São Paulo, Brasil',
      latitude: null,
      longitude: null,
    });
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject({
      status: 'CREATED',
      shipmentId: shipment.id,
      createdById: 2,
    });
  });

  it('creates a shipment for ADMINISTRATOR with validated body ownership', async () => {
    const store = fakeShipments();
    const useCase = new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    );

    const shipment = await useCase.execute({
      ...baseCreateInput(),
      customerId: 1,
      handledById: 2,
      principal: admin,
    });

    expect(shipment).toMatchObject({ customerId: 1, handledById: 2 });
  });

  it('rejects duplicate cargo codes case-insensitively', async () => {
    const store = fakeShipments();
    const useCase = new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    );
    await useCase.execute({
      ...baseCreateInput('UT-0001'),
      principal: operator,
    });

    await expect(
      useCase.execute({ ...baseCreateInput('ut-0001'), principal: operator }),
    ).rejects.toMatchObject({ code: 'SHIPMENT_CARGO_CODE_IN_USE' });
  });

  it('rejects estimated delivery before departure', async () => {
    const useCase = new CreateShipmentUseCase(
      fakeShipments().repo,
      fakeCustomers(),
      fakeUsers(),
    );

    await expect(
      useCase.execute({
        ...baseCreateInput(),
        departureDate: future(5),
        estimatedDeliveryDate: future(2),
        principal: operator,
      }),
    ).rejects.toMatchObject({ code: 'SHIPMENT_INVALID_DATES' });
  });

  it('rejects estimated delivery in the past', async () => {
    const useCase = new CreateShipmentUseCase(
      fakeShipments().repo,
      fakeCustomers(),
      fakeUsers(),
    );
    const past = new Date();
    past.setDate(past.getDate() - 1);

    await expect(
      useCase.execute({
        ...baseCreateInput(),
        departureDate: past,
        estimatedDeliveryDate: past,
        principal: operator,
      }),
    ).rejects.toMatchObject({
      code: 'SHIPMENT_INVALID_DATES',
    });
  });

  it('rejects unknown customers for ADMINISTRATOR', async () => {
    const useCase = new CreateShipmentUseCase(
      fakeShipments().repo,
      fakeCustomers(),
      fakeUsers(),
    );

    await expect(
      useCase.execute({
        ...baseCreateInput(),
        customerId: 99,
        handledById: 2,
        principal: admin,
      }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
  });

  it('rejects inactive handlers', async () => {
    const useCase = new CreateShipmentUseCase(
      fakeShipments().repo,
      fakeCustomers(),
      fakeUsers(),
    );

    await expect(
      useCase.execute({
        ...baseCreateInput(),
        customerId: 1,
        handledById: 4,
        principal: admin,
      }),
    ).rejects.toMatchObject({ code: 'SHIPMENT_HANDLER_INACTIVE' });
  });

  it('rejects handlers from another customer', async () => {
    const useCase = new CreateShipmentUseCase(
      fakeShipments().repo,
      fakeCustomers(),
      fakeUsers(),
    );

    await expect(
      useCase.execute({
        ...baseCreateInput(),
        customerId: 1,
        handledById: 3,
        principal: admin,
      }),
    ).rejects.toMatchObject({ code: 'SHIPMENT_HANDLER_REQUIRED' });
  });

  it('rejects non-operator handlers', async () => {
    const useCase = new CreateShipmentUseCase(
      fakeShipments().repo,
      fakeCustomers(),
      fakeUsers(),
    );

    await expect(
      useCase.execute({
        ...baseCreateInput(),
        customerId: 1,
        handledById: 1,
        principal: admin,
      }),
    ).rejects.toMatchObject({ code: 'SHIPMENT_HANDLER_REQUIRED' });
  });

  it('denies CUSTOMER profiles and unlinked principals', async () => {
    const useCase = new CreateShipmentUseCase(
      fakeShipments().repo,
      fakeCustomers(),
      fakeUsers(),
    );

    await expect(
      useCase.execute({ ...baseCreateInput(), principal: portal }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      useCase.execute({ ...baseCreateInput(), principal: unlinkedPortal }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('UpdateShipmentStatusUseCase', () => {
  async function createdCargo(code = 'UT-0010') {
    const store = fakeShipments();
    const shipment = await new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    ).execute({ ...baseCreateInput(code), principal: operator });
    return { store, shipment };
  }

  it('moves CREATED to IN_TRANSIT and records history', async () => {
    const { store, shipment } = await createdCargo();

    const updated = await new UpdateShipmentStatusUseCase(store.repo).execute({
      cargoCode: shipment.cargoCode,
      status: 'in_transit',
      locationText: 'Campinas, SP',
      principal: operator,
    });

    expect(updated).toMatchObject({
      eventId: expect.any(String),
      duplicate: false,
    });
    expect(store.events).toHaveLength(2);
    expect(store.events[1]).toMatchObject({
      status: 'IN_TRANSIT',
      locationText: 'Campinas, SP',
      createdById: 2,
    });
  });

  it('rejects backward and skipping transitions', async () => {
    const { store, shipment } = await createdCargo();
    const useCase = new UpdateShipmentStatusUseCase(store.repo);
    await useCase.execute({
      cargoCode: shipment.cargoCode,
      status: 'IN_TRANSIT',
      locationText: 'Campinas, SP',
      principal: operator,
    });

    await expect(
      useCase.execute({
        cargoCode: shipment.cargoCode,
        status: 'CREATED',
        locationText: 'São Paulo, SP',
        principal: operator,
      }),
    ).rejects.toMatchObject({
      code: 'SHIPMENT_INVALID_TRANSITION',
    });
    await expect(
      useCase.execute({
        cargoCode: shipment.cargoCode,
        status: 'DELIVERED',
        locationText: 'Rio de Janeiro, RJ',
        principal: operator,
      }),
    ).rejects.toMatchObject({
      code: 'SHIPMENT_INVALID_TRANSITION',
    });
  });

  it('returns 404 for missing or foreign-customer cargos', async () => {
    const { store, shipment } = await createdCargo();
    const useCase = new UpdateShipmentStatusUseCase(store.repo);

    await expect(
      useCase.execute({
        cargoCode: 'MISSING-1',
        status: 'IN_TRANSIT',
        locationText: 'X',
        principal: operator,
      }),
    ).rejects.toMatchObject({
      code: 'SHIPMENT_NOT_FOUND',
    });
    await expect(
      useCase.execute({
        cargoCode: shipment.cargoCode,
        status: 'IN_TRANSIT',
        locationText: 'X',
        principal: otherOperator,
      }),
    ).rejects.toMatchObject({
      code: 'SHIPMENT_NOT_FOUND',
    });
    await expect(
      useCase.execute({
        cargoCode: shipment.cargoCode,
        status: 'IN_TRANSIT',
        locationText: 'X',
        principal: portal,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('retries once after a concurrent touch and keeps both occurrences', async () => {
    const { store, shipment } = await createdCargo();
    store.repo.conflictOnNextUpdate = true;

    const updated = await new UpdateShipmentStatusUseCase(store.repo).execute({
      cargoCode: shipment.cargoCode,
      status: 'IN_TRANSIT',
      locationText: 'Campinas, SP',
      principal: operator,
    });

    expect(updated.eventId).toBeTruthy();
    expect(store.events).toHaveLength(2);
  });

  it('accepts an event durably even when processing will need retries', async () => {
    const { store, shipment } = await createdCargo();

    const accepted = await new UpdateShipmentStatusUseCase(store.repo).execute({
      cargoCode: shipment.cargoCode,
      status: 'IN_TRANSIT',
      locationText: 'Campinas, SP',
      principal: operator,
    });
    expect(accepted.eventId).toBeTruthy();
  });
});

describe('UpdateShipmentLocationUseCase', () => {
  it('records a location event with the same status without touching the shipment row', async () => {
    const store = fakeShipments();
    const shipment = await new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    ).execute({ ...baseCreateInput('UT-0020'), principal: operator });

    const updated = await new UpdateShipmentLocationUseCase(store.repo).execute(
      {
        cargoCode: shipment.cargoCode,
        locationText: 'Maceió, AL',
        latitude: -9.6658,
        longitude: -35.7353,
        notes: 'GPS ping',
        idempotencyKey: 'location-1',
        principal: operator,
      },
    );

    expect(updated).toMatchObject({
      eventId: expect.any(String),
      duplicate: false,
    });
    // The shipment row itself is untouched: status and timestamps stay the same.
    expect(
      (
        await store.repo.findByCargoCode(shipment.cargoCode)
      )?.updatedAt.getTime(),
    ).toBe(shipment.updatedAt.getTime());
    expect(store.events).toHaveLength(2);
    expect(store.events[1]).toMatchObject({
      status: 'CREATED',
      notes: 'GPS ping',
    });
  });

  it('deduplicates location requests with the same key and rejects changed payloads', async () => {
    const store = fakeShipments();
    const shipment = await new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    ).execute({ ...baseCreateInput('UT-0021'), principal: operator });
    const useCase = new UpdateShipmentLocationUseCase(store.repo);
    const input = {
      cargoCode: shipment.cargoCode,
      locationText: 'Maceió, AL',
      principal: operator,
      idempotencyKey: 'same-key',
    };
    const first = await useCase.execute(input);
    const repeated = await useCase.execute(input);
    expect(repeated).toMatchObject({ eventId: first.eventId, duplicate: true });
    expect(store.events).toHaveLength(2);
    await expect(
      useCase.execute({ ...input, locationText: 'Recife, PE' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });
  });

  it('rejects unpaired coordinates', async () => {
    const store = fakeShipments();
    const shipment = await new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    ).execute({ ...baseCreateInput('UT-0021'), principal: operator });

    await expect(
      new UpdateShipmentLocationUseCase(store.repo).execute({
        cargoCode: shipment.cargoCode,
        locationText: 'Maceió, AL',
        latitude: -9.6658,
        idempotencyKey: 'location-invalid',
        principal: operator,
      }),
    ).rejects.toMatchObject({ code: 'SHIPMENT_INVALID' });
  });
});

describe('MarkShipmentDeliveredUseCase', () => {
  it('delivers from a non-terminal status with location fallback', async () => {
    const store = fakeShipments();
    const shipment = await new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    ).execute({
      ...baseCreateInput('UT-0030'),
      principal: operator,
    });
    await new UpdateShipmentStatusUseCase(store.repo).execute({
      cargoCode: shipment.cargoCode,
      status: 'IN_TRANSIT',
      locationText: 'Atlantic Ocean',
      principal: operator,
    });

    const delivered = await new MarkShipmentDeliveredUseCase(
      store.repo,
    ).execute({ cargoCode: shipment.cargoCode, principal: operator });

    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.deliveredAt).toBeInstanceOf(Date);
    expect(delivered.currentLocation).toMatchObject({
      locationText: 'Atlantic Ocean',
    });
    expect(store.events.at(-1)).toMatchObject({ status: 'DELIVERED' });
  });

  it('rejects delivering an already delivered shipment', async () => {
    const store = fakeShipments();
    const shipment = await new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    ).execute({ ...baseCreateInput('UT-0031'), principal: operator });
    await new MarkShipmentDeliveredUseCase(store.repo).execute({
      cargoCode: shipment.cargoCode,
      principal: operator,
    });

    await expect(
      new MarkShipmentDeliveredUseCase(store.repo).execute({
        cargoCode: shipment.cargoCode,
        principal: operator,
      }),
    ).rejects.toMatchObject({
      code: 'SHIPMENT_INVALID_TRANSITION',
    });
  });
});

describe('CancelShipmentUseCase', () => {
  it('removes the shipment and its history', async () => {
    const store = fakeShipments();
    const shipment = await new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    ).execute({ ...baseCreateInput('UT-0040'), principal: operator });

    await new CancelShipmentUseCase(store.repo).execute(
      shipment.cargoCode,
      operator,
    );

    expect(await store.repo.findByCargoCode(shipment.cargoCode)).toBeNull();
    expect(store.events).toHaveLength(0);
  });

  it('does not remove foreign-customer cargos', async () => {
    const store = fakeShipments();
    const shipment = await new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    ).execute({ ...baseCreateInput('UT-0041'), principal: operator });

    await expect(
      new CancelShipmentUseCase(store.repo).execute(
        shipment.cargoCode,
        otherOperator,
      ),
    ).rejects.toMatchObject({ code: 'SHIPMENT_NOT_FOUND' });
    expect(await store.repo.findByCargoCode(shipment.cargoCode)).not.toBeNull();
  });
});

describe('GetShipmentUseCase and ListShipmentsUseCase', () => {
  async function seededStore() {
    const store = fakeShipments();
    const create = new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    );
    await create.execute({
      ...baseCreateInput('UT-0101'),
      customerId: 1,
      handledById: 2,
      principal: admin,
    });
    await create.execute({
      ...baseCreateInput('UT-0102'),
      customerId: 2,
      handledById: 3,
      principal: admin,
    });
    return store;
  }

  it('reads own-customer cargos and hides foreign ones', async () => {
    const store = await seededStore();
    const get = new GetShipmentUseCase(store.repo);

    const detail = await get.execute('UT-0101', operator);
    expect(detail.cargoCode).toBe('UT-0101');
    // Current location comes from the latest (CREATED) event.
    expect(detail.currentLocation).toMatchObject({
      locationText: 'São Paulo, Brasil',
    });
    await expect(get.execute('UT-0102', operator)).rejects.toMatchObject({
      code: 'SHIPMENT_NOT_FOUND',
    });
    await expect(get.execute('NOPE-1', operator)).rejects.toMatchObject({
      code: 'SHIPMENT_NOT_FOUND',
    });
  });

  it('forces the token scope over the idCliente filter', async () => {
    const store = await seededStore();

    const result = await new ListShipmentsUseCase(store.repo).execute({
      customerId: 2,
      principal: operator,
    });

    expect(result.total).toBe(1);
    expect(result.data[0].cargoCode).toBe('UT-0101');
  });

  it('supports combined admin filters and pagination metadata', async () => {
    const store = await seededStore();

    const result = await new ListShipmentsUseCase(store.repo).execute({
      status: 'created',
      customerId: 2,
      page: 1,
      limit: 10,
      principal: admin,
    });

    expect(result).toMatchObject({
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
    expect(result.data[0].cargoCode).toBe('UT-0102');
    expect(result.data[0].currentLocation).toMatchObject({
      locationText: 'São Paulo, Brasil',
    });
  });

  it('rejects oversized pages and unknown statuses', async () => {
    const store = await seededStore();
    const list = new ListShipmentsUseCase(store.repo);

    await expect(
      list.execute({ limit: 101, principal: admin }),
    ).rejects.toMatchObject({ code: 'SHIPMENT_INVALID' });
    await expect(
      list.execute({ status: 'LOST', principal: admin }),
    ).rejects.toMatchObject({ code: 'SHIPMENT_INVALID' });
  });

  it('delegates status shortcuts to the list use-case', async () => {
    const store = await seededStore();
    const list = new ListShipmentsUseCase(store.repo);

    const result = await new ListShipmentsByStatusUseCase(list).execute(
      'CREATED',
      { principal: admin },
    );

    expect(result.total).toBe(2);
  });
});

describe('Shipment history use-cases', () => {
  it('returns movement history most recent first', async () => {
    const store = fakeShipments();
    const shipment = await new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    ).execute({ ...baseCreateInput('UT-0201'), principal: operator });
    await new UpdateShipmentStatusUseCase(store.repo).execute({
      cargoCode: shipment.cargoCode,
      status: 'IN_TRANSIT',
      locationText: 'Campinas, SP',
      principal: operator,
    });

    const history = await new GetShipmentHistoryUseCase(store.repo).execute({
      cargoCode: shipment.cargoCode,
      principal: operator,
    });

    expect(history.total).toBe(2);
    expect(history.data[0].status).toBe('IN_TRANSIT');
    expect(history.data[1].status).toBe('CREATED');
    await expect(
      new GetShipmentHistoryUseCase(store.repo).execute({
        cargoCode: shipment.cargoCode,
        principal: otherOperator,
      }),
    ).rejects.toMatchObject({
      code: 'SHIPMENT_NOT_FOUND',
    });
  });

  it('lists global history for admins with a time window', async () => {
    const store = fakeShipments();
    await new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    ).execute({ ...baseCreateInput('UT-0202'), principal: operator });

    const result = await new ListShipmentEventsUseCase(store.repo).execute({
      occurredFrom: new Date(Date.now() - 86_400_000),
      principal: admin,
    });

    expect(result.total).toBe(1);
    await expect(
      new ListShipmentEventsUseCase(store.repo).execute({ principal: admin }),
    ).rejects.toMatchObject({ code: 'SHIPMENT_INVALID' });
    await expect(
      new ListShipmentEventsUseCase(store.repo).execute({
        occurredFrom: new Date(Date.now() - 86_400_000),
        principal: operator,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('records manual occurrences with backdated dates without moving the shipment', async () => {
    const store = fakeShipments();
    const shipment = await new CreateShipmentUseCase(
      store.repo,
      fakeCustomers(),
      fakeUsers(),
    ).execute({ ...baseCreateInput('UT-0203'), principal: operator });
    const occurredAt = new Date(Date.now() - 3 * 86_400_000);

    const event = await new AddShipmentEventUseCase(store.repo).execute({
      cargoCode: shipment.cargoCode,
      locationText: 'Manual checkpoint',
      notes: 'Support note',
      occurredAt,
      principal: admin,
    });

    expect(event).toMatchObject({
      status: 'CREATED',
      locationText: 'Manual checkpoint',
      notes: 'Support note',
    });
    expect(event.occurredAt.getTime()).toBe(occurredAt.getTime());
    expect((await store.repo.findByCargoCode(shipment.cargoCode))?.status).toBe(
      'CREATED',
    );
    await expect(
      new AddShipmentEventUseCase(store.repo).execute({
        cargoCode: shipment.cargoCode,
        locationText: 'X',
        principal: operator,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
