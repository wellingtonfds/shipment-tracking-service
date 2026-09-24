import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma.service.js';
import { PrismaShipmentRepositoryAdapter } from './prisma-shipment-repository.adapter.js';

const date = new Date('2026-01-01T00:00:00.000Z');
const decimal = (value: number) => ({ toNumber: () => value });
const shipmentRecord = {
  id: 7,
  cargoCode: 'CARGO-7',
  status: 'CREATED',
  originCity: 'São Paulo',
  originCountry: 'Brazil',
  originAddress: 'São Paulo, Brazil',
  originLatitude: decimal(-23),
  originLongitude: null,
  destinationCity: 'Rio',
  destinationCountry: 'Brazil',
  destinationAddress: 'Rio, Brazil',
  destinationLatitude: null,
  destinationLongitude: null,
  geocodedAt: null,
  geocodeProvider: null,
  departureDate: date,
  estimatedDeliveryDate: date,
  deliveredAt: null,
  customerId: 2,
  handledById: 3,
  createdAt: date,
  updatedAt: date,
};
const eventRecord = {
  id: 10,
  shipmentId: 7,
  status: 'CREATED',
  occurredAt: date,
  locationText: 'São Paulo',
  latitude: decimal(-23),
  longitude: null,
  notes: null,
  createdById: 3,
  createdAt: date,
};

function harness() {
  const tx = {
    shipment: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(shipmentRecord),
      create: vi.fn().mockResolvedValue(shipmentRecord),
    },
    shipmentEvent: { create: vi.fn().mockResolvedValue(eventRecord) },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
    shipment: {
      findMany: vi.fn().mockResolvedValue([shipmentRecord]),
      count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn().mockResolvedValue(shipmentRecord),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    shipmentEvent: {
      findFirst: vi.fn().mockResolvedValue(eventRecord),
      findMany: vi.fn().mockResolvedValue([eventRecord]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(eventRecord),
    },
  };
  return {
    prisma,
    tx,
    adapter: new PrismaShipmentRepositoryAdapter(
      prisma as unknown as PrismaService,
    ),
  };
}

describe('PrismaShipmentRepositoryAdapter queries', () => {
  it('maps decimal columns and applies tenant, date, sort, and pagination filters', async () => {
    const { prisma, adapter } = harness();
    const query = {
      page: 2,
      limit: 5,
      orderBy: 'departureDate' as const,
      order: 'desc' as const,
      filters: {
        status: 'CREATED' as const,
        customerScopeId: 2,
        customerId: 99,
        handledById: 3,
        departureFrom: date,
        estimatedTo: date,
      },
    };

    await expect(adapter.findMany(query)).resolves.toEqual([
      expect.objectContaining({
        cargoCode: 'CARGO-7',
        originLatitude: -23,
        originLongitude: null,
      }),
    ]);
    expect(prisma.shipment.findMany).toHaveBeenCalledWith({
      where: {
        status: 'CREATED',
        customerId: 2,
        handledById: 3,
        departureDate: { gte: date },
        estimatedDeliveryDate: { lte: date },
      },
      orderBy: [{ departureDate: 'desc' }, { id: 'desc' }],
      skip: 5,
      take: 5,
    });
    await expect(adapter.count(query.filters)).resolves.toBe(1);
    expect(prisma.shipment.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ customerId: 2 }),
    });
  });

  it('returns null for a missing cargo and maps a found cargo', async () => {
    const { prisma, adapter } = harness();
    await expect(adapter.findByCargoCode('CARGO-7')).resolves.toMatchObject({
      id: 7,
    });
    prisma.shipment.findUnique.mockResolvedValue(null);
    await expect(adapter.findByCargoCode('missing')).resolves.toBeNull();
  });

  it('uses one grouped event query for the latest location of several shipments', async () => {
    const { prisma, adapter } = harness();
    prisma.shipmentEvent.findMany.mockResolvedValue([
      {
        shipmentId: 7,
        locationText: 'São Paulo',
        latitude: decimal(-23),
        longitude: null,
      },
    ]);

    await expect(adapter.findLatestLocations([])).resolves.toEqual(new Map());
    expect(prisma.shipmentEvent.findMany).not.toHaveBeenCalled();
    await expect(adapter.findLatestLocations([7, 8])).resolves.toEqual(
      new Map([
        [
          7,
          {
            locationText: 'São Paulo',
            latitude: -23,
            longitude: null,
          },
        ],
      ]),
    );
    expect(prisma.shipmentEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shipmentId: { in: [7, 8] } },
        distinct: ['shipmentId'],
      }),
    );
  });

  it('returns the newest event location or null when no event exists', async () => {
    const { prisma, adapter } = harness();
    await expect(adapter.findLatestLocation(7)).resolves.toEqual({
      locationText: 'São Paulo',
      latitude: -23,
      longitude: null,
    });
    prisma.shipmentEvent.findFirst.mockResolvedValue(null);
    await expect(adapter.findLatestLocation(8)).resolves.toBeNull();
  });

  it('lists and counts shipment history with newest occurrence first', async () => {
    const { prisma, adapter } = harness();
    await expect(adapter.findEventsByShipment(7, 2, 3)).resolves.toEqual([
      expect.objectContaining({
        id: 10,
        latitude: -23,
      }),
    ]);
    expect(prisma.shipmentEvent.findMany).toHaveBeenCalledWith({
      where: { shipmentId: 7 },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      skip: 3,
      take: 3,
    });
    await expect(adapter.countEventsByShipment(7)).resolves.toBe(1);
    expect(prisma.shipmentEvent.count).toHaveBeenCalledWith({
      where: { shipmentId: 7 },
    });
  });

  it('filters global history by shipment, status, and occurrence dates', async () => {
    const { prisma, adapter } = harness();
    const filters = {
      shipmentId: 7,
      status: 'CREATED' as const,
      occurredFrom: date,
      occurredTo: date,
    };
    await expect(adapter.findEvents(filters, 1, 10)).resolves.toHaveLength(1);
    expect(prisma.shipmentEvent.findMany).toHaveBeenCalledWith({
      where: {
        shipmentId: 7,
        status: 'CREATED',
        occurredAt: { gte: date, lte: date },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 10,
    });
    await expect(adapter.countEvents(filters)).resolves.toBe(1);
  });

  it('creates a history event with explicit optional values', async () => {
    const { prisma, adapter } = harness();
    await expect(
      adapter.createEvent({
        shipmentId: 7,
        status: 'CREATED',
        locationText: 'São Paulo',
        occurredAt: date,
        latitude: -23,
        longitude: null,
        notes: null,
        createdById: 3,
      }),
    ).resolves.toMatchObject({ id: 10, status: 'CREATED' });
    expect(prisma.shipmentEvent.create).toHaveBeenCalledWith({
      data: {
        shipmentId: 7,
        status: 'CREATED',
        occurredAt: date,
        locationText: 'São Paulo',
        latitude: -23,
        longitude: null,
        notes: null,
        createdById: 3,
      },
    });
  });

  it('deletes by cargo code', async () => {
    const { prisma, adapter } = harness();
    await adapter.deleteByCargoCode('CARGO-7');
    expect(prisma.shipment.delete).toHaveBeenCalledWith({
      where: { cargoCode: 'CARGO-7' },
    });
  });

  it('updates status conditionally and appends history in the same transaction', async () => {
    const { adapter, tx, prisma } = harness();
    const update = {
      shipmentId: 7,
      expectedStatus: 'CREATED' as const,
      expectedUpdatedAt: date,
      nextStatus: 'IN_TRANSIT' as const,
      locationText: 'São Paulo',
      latitude: -23,
      longitude: null,
      notes: 'Departed',
      createdById: 3,
      deliveredAt: null,
    };

    await expect(adapter.updateStatusOnce(update)).resolves.toMatchObject({
      id: 7,
      cargoCode: 'CARGO-7',
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.shipment.updateMany).toHaveBeenCalledWith({
      where: { id: 7, status: 'CREATED', updatedAt: date },
      data: { status: 'IN_TRANSIT' },
    });
    expect(tx.shipmentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shipmentId: 7,
        status: 'IN_TRANSIT',
        locationText: 'São Paulo',
        notes: 'Departed',
      }),
    });
  });

  it('creates the shipment and its initial history event atomically', async () => {
    const { adapter, tx, prisma } = harness();
    const data = {
      cargoCode: 'CARGO-7',
      status: 'CREATED' as const,
      originCity: 'São Paulo',
      originCountry: 'Brazil',
      originAddress: 'São Paulo, Brazil',
      originLatitude: -23,
      originLongitude: null,
      destinationCity: 'Rio',
      destinationCountry: 'Brazil',
      destinationAddress: 'Rio, Brazil',
      destinationLatitude: null,
      destinationLongitude: null,
      departureDate: date,
      estimatedDeliveryDate: date,
      customerId: 2,
      handledById: 3,
    };

    await expect(adapter.create(data)).resolves.toMatchObject({
      id: 7,
      cargoCode: 'CARGO-7',
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.shipment.create).toHaveBeenCalledWith({ data });
    expect(tx.shipmentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shipmentId: 7,
        status: 'CREATED',
        locationText: 'São Paulo, Brazil',
        createdById: 3,
      }),
    });
  });

  it('reports a conflict when a concurrent update wins', async () => {
    const { adapter, tx } = harness();
    tx.shipment.updateMany.mockResolvedValue({ count: 0 });
    const update = {
      shipmentId: 7,
      expectedStatus: 'CREATED' as const,
      expectedUpdatedAt: date,
      nextStatus: 'IN_TRANSIT' as const,
      locationText: 'São Paulo',
      latitude: null,
      longitude: null,
      notes: null,
      createdById: 3,
      deliveredAt: null,
    };

    await expect(adapter.updateStatusOnce(update)).rejects.toMatchObject({
      code: 'SHIPMENT_CONFLICT',
    });
    expect(tx.shipmentEvent.create).not.toHaveBeenCalled();
  });
});
