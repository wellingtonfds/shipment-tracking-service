import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';
import { IdempotencyKeyConflictError } from '../../../domain/shipments/errors/idempotency-key-conflict.error.js';
import { ShipmentNotFoundError } from '../../../domain/shipments/errors/shipment-not-found.error.js';
import type { TrackingOutboxInput } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { PrismaService } from '../prisma.service.js';
import { PrismaShipmentRepositoryAdapter } from './prisma-shipment-repository.adapter.js';

const acceptedAt = new Date('2026-01-01T00:00:00.000Z');
const payload = JSON.stringify({ status: 'IN_TRANSIT' });
const input: TrackingOutboxInput = {
  shipmentId: 7,
  eventType: 'LOCATION',
  payload,
  idempotencyKey: 'request-1',
};

function harness() {
  const tx = {
    trackingIdempotencyKey: {
      findUnique: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
    },
    trackingOutbox: {
      create: vi
        .fn()
        .mockResolvedValue({ id: 'outbox-1', createdAt: acceptedAt }),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: 'outbox-1', createdAt: acceptedAt }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    shipment: { findUnique: vi.fn().mockResolvedValue({ status: 'CREATED' }) },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
    trackingIdempotencyKey: { findUnique: vi.fn().mockResolvedValue(null) },
    trackingOutbox: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: 'outbox-1', createdAt: acceptedAt }),
    },
  };
  return {
    tx,
    prisma,
    adapter: new PrismaShipmentRepositoryAdapter(
      prisma as unknown as PrismaService,
    ),
  };
}

describe('PrismaShipmentRepositoryAdapter tracking acceptance', () => {
  it('creates an outbox item and a five-year idempotency record together', async () => {
    const { tx, prisma, adapter } = harness();

    await expect(adapter.acceptTrackingUpdate(input)).resolves.toEqual({
      id: 'outbox-1',
      acceptedAt,
      duplicate: false,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(tx.trackingOutbox.create).toHaveBeenCalledWith({
      data: { shipmentId: 7, eventType: 'LOCATION', payload },
    });
    expect(tx.trackingIdempotencyKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shipmentId: 7,
        key: 'request-1',
        outboxId: 'outbox-1',
      }),
    });
    const expiry = tx.trackingIdempotencyKey.create.mock.calls[0][0].data
      .expiresAt as Date;
    expect(expiry.getUTCFullYear()).toBe(new Date().getUTCFullYear() + 5);
  });

  it('returns the original acceptance before creating another outbox item', async () => {
    const { tx, adapter } = harness();
    const { createHash } = await import('node:crypto');
    tx.trackingIdempotencyKey.findUnique.mockResolvedValue({
      outboxId: 'outbox-1',
      expiresAt: new Date('2100-01-01'),
      payloadHash: createHash('sha256').update(payload).digest('hex'),
    });

    await expect(adapter.acceptTrackingUpdate(input)).resolves.toEqual({
      id: 'outbox-1',
      acceptedAt,
      duplicate: true,
    });
    expect(tx.trackingOutbox.create).not.toHaveBeenCalled();
  });

  it('rejects a reused key with a different payload', async () => {
    const { tx, adapter } = harness();
    tx.trackingIdempotencyKey.findUnique.mockResolvedValue({
      outboxId: 'outbox-1',
      expiresAt: new Date('2100-01-01'),
      payloadHash: 'different',
    });

    await expect(adapter.acceptTrackingUpdate(input)).rejects.toBeInstanceOf(
      IdempotencyKeyConflictError,
    );
    expect(tx.trackingOutbox.create).not.toHaveBeenCalled();
  });

  it('replaces an expired key before accepting the new request', async () => {
    const { tx, adapter } = harness();
    tx.trackingIdempotencyKey.findUnique.mockResolvedValue({
      id: 'expired',
      expiresAt: new Date(0),
    });

    await expect(adapter.acceptTrackingUpdate(input)).resolves.toMatchObject({
      duplicate: false,
    });
    expect(tx.trackingIdempotencyKey.delete).toHaveBeenCalledWith({
      where: { id: 'expired' },
    });
    expect(tx.trackingOutbox.create).toHaveBeenCalledOnce();
  });

  it('validates a status transition against the newest pending update', async () => {
    const { tx, adapter } = harness();
    tx.trackingOutbox.findFirst.mockResolvedValue({
      payload: JSON.stringify({ status: 'IN_TRANSIT' }),
    });

    await expect(
      adapter.acceptTrackingUpdate({
        shipmentId: 7,
        eventType: 'STATUS',
        payload: JSON.stringify({ status: 'TRANSFERRED' }),
      }),
    ).resolves.toMatchObject({ duplicate: false });
    expect(tx.trackingOutbox.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shipmentId: 7, eventType: 'STATUS', processedAt: null },
      }),
    );
    expect(tx.trackingIdempotencyKey.create).not.toHaveBeenCalled();
  });

  it('rejects status acceptance for a deleted shipment', async () => {
    const { tx, adapter } = harness();
    tx.shipment.findUnique.mockResolvedValue(null);

    await expect(
      adapter.acceptTrackingUpdate({
        shipmentId: 7,
        eventType: 'STATUS',
        payload,
      }),
    ).rejects.toBeInstanceOf(ShipmentNotFoundError);
    expect(tx.trackingOutbox.create).not.toHaveBeenCalled();
  });

  it('resolves a uniqueness race to the original acceptance', async () => {
    const { prisma, adapter } = harness();
    const { createHash } = await import('node:crypto');
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7.10.0',
      }),
    );
    prisma.trackingIdempotencyKey.findUnique.mockResolvedValue({
      outboxId: 'outbox-1',
      payloadHash: createHash('sha256').update(payload).digest('hex'),
    });

    await expect(adapter.acceptTrackingUpdate(input)).resolves.toMatchObject({
      duplicate: true,
    });
    expect(prisma.trackingOutbox.findUniqueOrThrow).toHaveBeenCalledOnce();
  });
});
