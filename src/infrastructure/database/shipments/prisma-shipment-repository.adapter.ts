import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { IdempotencyKeyConflictError } from '../../../domain/shipments/errors/idempotency-key-conflict.error.js';
import { assertTransition } from '../../../domain/shipments/shipment.entity.js';
import { InvalidShipmentError } from '../../../domain/shipments/shipment.entity.js';
import {
  Shipment,
  ShipmentEvent,
  ShipmentLocation,
  ShipmentStatus,
} from '../../../domain/shipments/shipment.entity.js';
import { ShipmentCargoCodeInUseError } from '../../../domain/shipments/errors/shipment-cargo-code-in-use.error.js';
import { ShipmentConflictError } from '../../../domain/shipments/errors/shipment-conflict.error.js';
import { ShipmentNotFoundError } from '../../../domain/shipments/errors/shipment-not-found.error.js';
import {
  CreateShipmentEventData,
  CreateShipmentRecord,
  ShipmentEventFilters,
  ShipmentListFilters,
  ShipmentListQuery,
  ShipmentOrderField,
  ShipmentRepositoryPort,
  TrackingOutboxInput,
  ShipmentStatusUpdate,
  SortOrder,
} from '../../../domain/shipments/ports/shipment-repository.port.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';

interface DecimalLike {
  toNumber(): number;
}

interface ShipmentRecord {
  id: number;
  cargoCode: string;
  status: string;
  originCity: string;
  originCountry: string;
  originAddress: string;
  originLatitude: DecimalLike | null;
  originLongitude: DecimalLike | null;
  destinationCity: string;
  destinationCountry: string;
  destinationAddress: string;
  destinationLatitude: DecimalLike | null;
  destinationLongitude: DecimalLike | null;
  geocodedAt: Date | null;
  geocodeProvider: string | null;
  departureDate: Date;
  estimatedDeliveryDate: Date;
  deliveredAt: Date | null;
  customerId: number;
  handledById: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ShipmentEventRecord {
  id: number;
  shipmentId: number;
  status: string;
  occurredAt: Date;
  locationText: string;
  latitude: DecimalLike | null;
  longitude: DecimalLike | null;
  notes: string | null;
  createdById: number | null;
  createdAt: Date;
}

@Injectable()
export class PrismaShipmentRepositoryAdapter implements ShipmentRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(query: ShipmentListQuery): Promise<Shipment[]> {
    const records = await this.prisma.shipment.findMany({
      where: this.shipmentWhere(query.filters),
      orderBy: this.shipmentOrderBy(query.orderBy, query.order),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return records.map((record) => this.toShipment(record));
  }

  async count(filters: ShipmentListFilters): Promise<number> {
    return this.prisma.shipment.count({ where: this.shipmentWhere(filters) });
  }

  async findByCargoCode(cargoCode: string): Promise<Shipment | null> {
    const record = await this.prisma.shipment.findUnique({
      where: { cargoCode },
    });
    return record ? this.toShipment(record) : null;
  }

  async create(data: CreateShipmentRecord): Promise<Shipment> {
    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const created = await tx.shipment.create({
          data: {
            cargoCode: data.cargoCode,
            status: data.status,
            originCity: data.originCity,
            originCountry: data.originCountry,
            originAddress: data.originAddress,
            originLatitude: data.originLatitude,
            originLongitude: data.originLongitude,
            destinationCity: data.destinationCity,
            destinationCountry: data.destinationCountry,
            destinationAddress: data.destinationAddress,
            destinationLatitude: data.destinationLatitude,
            destinationLongitude: data.destinationLongitude,
            departureDate: data.departureDate,
            estimatedDeliveryDate: data.estimatedDeliveryDate,
            customerId: data.customerId,
            handledById: data.handledById,
          },
        });
        // The initial location (origin) lives only in the CREATED event.
        await tx.shipmentEvent.create({
          data: {
            shipmentId: created.id,
            status: 'CREATED',
            occurredAt: new Date(),
            locationText: data.originAddress,
            latitude: data.originLatitude,
            longitude: data.originLongitude,
            notes: 'Shipment registered in the system',
            createdById: data.handledById,
          },
        });
        return created;
      });
      return this.toShipment(record);
    } catch (error) {
      this.mapWriteError(error, data.cargoCode);
      throw error;
    }
  }

  /**
   * Single optimistic attempt: the conditional update only succeeds when no
   * concurrent write changed the shipment (status + updatedAt guard). The location
   * is written only to the new history event — the shipment row keeps status,
   * deliveredAt and timestamps. Zero rows affected means a concurrent
   * modification: the persisted row is re-read and reported through
   * ShipmentConflictError so the use-case can revalidate and retry.
   */
  async updateStatusOnce(data: ShipmentStatusUpdate): Promise<Shipment> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipment.updateMany({
        where: {
          id: data.shipmentId,
          status: data.expectedStatus,
          updatedAt: data.expectedUpdatedAt,
        },
        data: {
          status: data.nextStatus,
          ...(data.deliveredAt !== null
            ? { deliveredAt: data.deliveredAt }
            : {}),
        },
      });
      if (updated.count === 0) {
        throw await this.conflictOrNotFound(tx, data.shipmentId);
      }
      await tx.shipmentEvent.create({
        data: {
          shipmentId: data.shipmentId,
          status: data.nextStatus,
          occurredAt: new Date(),
          locationText: data.locationText,
          latitude: data.latitude,
          longitude: data.longitude,
          notes: data.notes,
          createdById: data.createdById,
        },
      });
      const record = await tx.shipment.findFirst({
        where: { id: data.shipmentId },
      });
      if (!record) {
        throw new ShipmentNotFoundError(String(data.shipmentId));
      }
      return this.toShipment(record);
    });
  }

  async findLatestLocation(
    shipmentId: number,
  ): Promise<ShipmentLocation | null> {
    const record = await this.prisma.shipmentEvent.findFirst({
      where: { shipmentId },
      orderBy: this.eventOrderBy(),
      select: { locationText: true, latitude: true, longitude: true },
    });
    if (!record) {
      return null;
    }
    return {
      locationText: record.locationText,
      latitude: this.toNumber(record.latitude),
      longitude: this.toNumber(record.longitude),
    };
  }

  async findLatestLocations(
    shipmentIds: number[],
  ): Promise<Map<number, ShipmentLocation>> {
    if (shipmentIds.length === 0) {
      return new Map();
    }
    // One grouped query (no N+1): the first row per shipmentId in this order is its latest event.
    const records = await this.prisma.shipmentEvent.findMany({
      where: { shipmentId: { in: shipmentIds } },
      orderBy: [{ shipmentId: 'asc' }, { occurredAt: 'desc' }, { id: 'desc' }],
      distinct: ['shipmentId'],
      select: {
        shipmentId: true,
        locationText: true,
        latitude: true,
        longitude: true,
      },
    });
    return new Map(
      records.map((record) => [
        record.shipmentId,
        {
          locationText: record.locationText,
          latitude: this.toNumber(record.latitude),
          longitude: this.toNumber(record.longitude),
        },
      ]),
    );
  }

  async deleteByCargoCode(cargoCode: string): Promise<void> {
    try {
      // Shipment -> ShipmentEvent is onDelete Cascade: removing the cargo removes its history.
      await this.prisma.shipment.delete({ where: { cargoCode } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new ShipmentNotFoundError(cargoCode);
      }
      throw error;
    }
  }

  async findEventsByShipment(
    shipmentId: number,
    page: number,
    limit: number,
  ): Promise<ShipmentEvent[]> {
    const records = await this.prisma.shipmentEvent.findMany({
      where: { shipmentId },
      orderBy: this.eventOrderBy(),
      skip: (page - 1) * limit,
      take: limit,
    });
    return records.map((record) => this.toEvent(record));
  }

  async countEventsByShipment(shipmentId: number): Promise<number> {
    return this.prisma.shipmentEvent.count({ where: { shipmentId } });
  }

  async findEvents(
    filters: ShipmentEventFilters,
    page: number,
    limit: number,
  ): Promise<ShipmentEvent[]> {
    const records = await this.prisma.shipmentEvent.findMany({
      where: this.eventWhere(filters),
      orderBy: this.eventOrderBy(),
      skip: (page - 1) * limit,
      take: limit,
    });
    return records.map((record) => this.toEvent(record));
  }

  async countEvents(filters: ShipmentEventFilters): Promise<number> {
    return this.prisma.shipmentEvent.count({ where: this.eventWhere(filters) });
  }

  async createEvent(data: CreateShipmentEventData): Promise<ShipmentEvent> {
    const record = await this.prisma.shipmentEvent.create({
      data: {
        shipmentId: data.shipmentId,
        status: data.status,
        occurredAt: data.occurredAt ?? new Date(),
        locationText: data.locationText,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        notes: data.notes ?? null,
        createdById: data.createdById ?? null,
      },
    });
    return this.toEvent(record);
  }

  async acceptTrackingUpdate(
    data: TrackingOutboxInput,
  ): Promise<{ id: string; acceptedAt: Date; duplicate: boolean }> {
    return this.acceptTrackingUpdateAttempt(data, 3);
  }

  private async acceptTrackingUpdateAttempt(
    data: TrackingOutboxInput,
    retriesLeft: number,
  ): Promise<{ id: string; acceptedAt: Date; duplicate: boolean }> {
    const payloadHash = createHash('sha256')
      .update(data.deduplicationPayload ?? data.payload)
      .digest('hex');
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (data.idempotencyKey) {
            const existing = await tx.trackingIdempotencyKey.findUnique({
              where: {
                shipmentId_key: {
                  shipmentId: data.shipmentId,
                  key: data.idempotencyKey,
                },
              },
            });
            if (existing && existing.expiresAt > new Date()) {
              if (existing.payloadHash !== payloadHash)
                throw new IdempotencyKeyConflictError();
              const original = await tx.trackingOutbox.findUniqueOrThrow({
                where: { id: existing.outboxId },
                select: { id: true, createdAt: true },
              });
              return {
                id: original.id,
                acceptedAt: original.createdAt,
                duplicate: true,
              };
            }
            if (existing) {
              await tx.trackingIdempotencyKey.delete({
                where: { id: existing.id },
              });
            }
          }
          if (data.eventType === 'STATUS') {
            const payload = JSON.parse(data.payload) as { status: string };
            const pending = await tx.trackingOutbox.findFirst({
              where: {
                shipmentId: data.shipmentId,
                eventType: 'STATUS',
                processedAt: null,
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            });
            const current = await tx.shipment.findUnique({
              where: { id: data.shipmentId },
            });
            if (!current)
              throw new ShipmentNotFoundError(String(data.shipmentId));
            const effectiveStatus = pending
              ? (JSON.parse(pending.payload) as { status: string }).status
              : current.status;
            assertTransition(
              effectiveStatus as ShipmentStatus,
              payload.status as ShipmentStatus,
            );
          }
          const outbox = await tx.trackingOutbox.create({
            data: {
              shipmentId: data.shipmentId,
              eventType: data.eventType,
              payload: data.payload,
            },
          });
          if (data.idempotencyKey) {
            const expiresAt = new Date();
            expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 5);
            await tx.trackingIdempotencyKey.create({
              data: {
                shipmentId: data.shipmentId,
                key: data.idempotencyKey,
                payloadHash,
                outboxId: outbox.id,
                expiresAt,
              },
            });
          }
          return {
            id: outbox.id,
            acceptedAt: outbox.createdAt,
            duplicate: false,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        data.idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        const existing = await this.prisma.trackingIdempotencyKey.findUnique({
          where: {
            shipmentId_key: {
              shipmentId: data.shipmentId,
              key: data.idempotencyKey,
            },
          },
        });
        if (existing) {
          if (existing.payloadHash !== payloadHash)
            throw new IdempotencyKeyConflictError();
          const original = await this.prisma.trackingOutbox.findUniqueOrThrow({
            where: { id: existing.outboxId },
            select: { id: true, createdAt: true },
          });
          return {
            id: original.id,
            acceptedAt: original.createdAt,
            duplicate: true,
          };
        }
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034' &&
        retriesLeft > 1
      ) {
        return this.acceptTrackingUpdateAttempt(data, retriesLeft - 1);
      }
      throw error;
    }
  }

  private async conflictOrNotFound(
    tx: Prisma.TransactionClient,
    shipmentId: number,
  ): Promise<ShipmentConflictError | ShipmentNotFoundError> {
    const current = await tx.shipment.findFirst({ where: { id: shipmentId } });
    if (!current) {
      return new ShipmentNotFoundError(String(shipmentId));
    }
    return new ShipmentConflictError(this.toShipment(current));
  }

  private shipmentWhere(
    filters: ShipmentListFilters,
  ): Prisma.ShipmentWhereInput {
    const customerId = filters.customerScopeId ?? filters.customerId;
    return {
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(customerId !== undefined && customerId !== null
        ? { customerId }
        : {}),
      ...(filters.handledById !== undefined
        ? { handledById: filters.handledById }
        : {}),
      ...(filters.departureFrom !== undefined ||
      filters.departureTo !== undefined
        ? {
            departureDate: {
              ...(filters.departureFrom !== undefined
                ? { gte: filters.departureFrom }
                : {}),
              ...(filters.departureTo !== undefined
                ? { lte: filters.departureTo }
                : {}),
            },
          }
        : {}),
      ...(filters.estimatedFrom !== undefined ||
      filters.estimatedTo !== undefined
        ? {
            estimatedDeliveryDate: {
              ...(filters.estimatedFrom !== undefined
                ? { gte: filters.estimatedFrom }
                : {}),
              ...(filters.estimatedTo !== undefined
                ? { lte: filters.estimatedTo }
                : {}),
            },
          }
        : {}),
    };
  }

  private shipmentOrderBy(
    orderBy: ShipmentOrderField,
    order: SortOrder,
  ): Prisma.ShipmentOrderByWithRelationInput[] {
    return [
      { [orderBy]: order } as Prisma.ShipmentOrderByWithRelationInput,
      { id: 'desc' },
    ];
  }

  private eventWhere(
    filters: ShipmentEventFilters,
  ): Prisma.ShipmentEventWhereInput {
    return {
      ...(filters.shipmentId !== undefined
        ? { shipmentId: filters.shipmentId }
        : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.occurredFrom !== undefined || filters.occurredTo !== undefined
        ? {
            occurredAt: {
              ...(filters.occurredFrom !== undefined
                ? { gte: filters.occurredFrom }
                : {}),
              ...(filters.occurredTo !== undefined
                ? { lte: filters.occurredTo }
                : {}),
            },
          }
        : {}),
    };
  }

  private eventOrderBy(): Prisma.ShipmentEventOrderByWithRelationInput[] {
    return [{ occurredAt: 'desc' }, { id: 'desc' }];
  }

  private mapWriteError(error: unknown, cargoCode: string): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ShipmentCargoCodeInUseError(cargoCode);
      }
      if (error.code === 'P2003') {
        throw new InvalidShipmentError(
          'Linked customer or handler does not exist',
        );
      }
    }
  }

  private toNumber(value: DecimalLike | null): number | null {
    return value === null ? null : value.toNumber();
  }

  private toShipment(record: ShipmentRecord): Shipment {
    return {
      id: record.id,
      cargoCode: record.cargoCode,
      status: record.status as ShipmentStatus,
      originCity: record.originCity,
      originCountry: record.originCountry,
      originAddress: record.originAddress,
      originLatitude: this.toNumber(record.originLatitude),
      originLongitude: this.toNumber(record.originLongitude),
      destinationCity: record.destinationCity,
      destinationCountry: record.destinationCountry,
      destinationAddress: record.destinationAddress,
      destinationLatitude: this.toNumber(record.destinationLatitude),
      destinationLongitude: this.toNumber(record.destinationLongitude),
      geocodedAt: record.geocodedAt,
      geocodeProvider: record.geocodeProvider,
      departureDate: record.departureDate,
      estimatedDeliveryDate: record.estimatedDeliveryDate,
      deliveredAt: record.deliveredAt,
      customerId: record.customerId,
      handledById: record.handledById,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private toEvent(record: ShipmentEventRecord): ShipmentEvent {
    return {
      id: record.id,
      shipmentId: record.shipmentId,
      status: record.status as ShipmentStatus,
      occurredAt: record.occurredAt,
      locationText: record.locationText,
      latitude: this.toNumber(record.latitude),
      longitude: this.toNumber(record.longitude),
      notes: record.notes,
      createdById: record.createdById,
      createdAt: record.createdAt,
    };
  }
}
