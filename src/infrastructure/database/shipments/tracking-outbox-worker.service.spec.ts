import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { BullBoardInstance } from '@bull-board/nestjs';
import type { Redis } from 'ioredis';
import type { Queue, Job } from 'bullmq';
import type { AppConfig, TrackingConfig } from '../../config/configuration.js';
import { PrismaService } from '../prisma.service.js';
import { TrackingGeocoder } from './tracking-geocoder.js';
import { TrackingOutboxWorkerService } from './tracking-outbox-worker.service.js';

const tracking = {
  queueEnabled: true,
  workerRole: false,
  dispatcherRole: false,
  outboxRedisReconcileMs: 60_000,
  lockTtlMs: 120_000,
  retryWindowMs: 86_400_000,
} as TrackingConfig;

const outbox = {
  id: 'outbox-1',
  shipmentId: 7,
  eventType: 'STATUS',
  processedAt: null,
  payload: JSON.stringify({
    status: 'IN_TRANSIT',
    locationText: 'Porto Alegre',
    latitude: null,
    longitude: null,
    notes: null,
    createdById: 2,
    occurredAt: '2026-01-02T00:00:00.000Z',
  }),
};

function harness() {
  const tx = {
    trackingOutbox: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    shipment: {
      findUnique: vi.fn().mockResolvedValue({ id: 7, status: 'CREATED' }),
      update: vi.fn().mockResolvedValue(undefined),
    },
    shipmentEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(undefined),
    },
  };
  const prisma = {
    trackingOutbox: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(outbox),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
    ),
  };
  const redis = {
    set: vi.fn().mockResolvedValue('OK'),
    eval: vi.fn().mockResolvedValue(1),
  };
  const queue = {
    getJob: vi.fn().mockResolvedValue(null),
    add: vi.fn().mockResolvedValue(undefined),
  };
  const geocoder = {
    resolveLocation: vi
      .fn()
      .mockImplementation(async (location: unknown) => location),
  };
  const config = { getOrThrow: vi.fn().mockReturnValue(tracking) };
  const worker = new TrackingOutboxWorkerService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService<AppConfig>,
    { addQueue: vi.fn() } as unknown as BullBoardInstance,
  );
  worker['redis'] = redis as unknown as Redis;
  worker['queue'] = queue as unknown as Queue;
  worker['geocoder'] = geocoder as unknown as TrackingGeocoder;
  return { worker, prisma, tx, redis, queue, geocoder };
}

describe('TrackingOutboxWorkerService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('dispatches missing jobs and records the dispatch attempt', async () => {
    const { worker, prisma, queue } = harness();
    prisma.trackingOutbox.findMany.mockResolvedValue([outbox]);

    await worker['dispatchPending']();

    expect(queue.add).toHaveBeenCalledWith(
      'STATUS',
      { outboxId: 'outbox-1' },
      { jobId: 'outbox-1' },
    );
    expect(prisma.trackingOutbox.updateMany).toHaveBeenCalledWith({
      where: { id: 'outbox-1', processedAt: null },
      data: { dispatchedAt: expect.any(Date), attempts: { increment: 1 } },
    });
  });

  it('reconciles an already waiting job without publishing a duplicate', async () => {
    const { worker, prisma, queue } = harness();
    prisma.trackingOutbox.findMany.mockResolvedValue([outbox]);
    queue.getJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue('waiting'),
    });

    await worker['dispatchPending']();

    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.trackingOutbox.updateMany).toHaveBeenCalledWith({
      where: { id: 'outbox-1', processedAt: null },
      data: { dispatchedAt: expect.any(Date) },
    });
  });

  it('replaces a stale completed job', async () => {
    const { worker, prisma, queue } = harness();
    const remove = vi.fn();
    prisma.trackingOutbox.findMany.mockResolvedValue([outbox]);
    queue.getJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue('completed'),
      remove,
    });

    await worker['dispatchPending']();

    expect(remove).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledOnce();
  });

  it('records an on-time status event and advances the shipment in one transaction', async () => {
    const { worker, tx, redis, geocoder, prisma } = harness();

    await worker['processJob']({ data: { outboxId: 'outbox-1' } } as Job<{
      outboxId: string;
    }>);

    expect(redis.set).toHaveBeenCalledWith(
      'tracking:shipment:7',
      expect.any(String),
      'PX',
      120_000,
      'NX',
    );
    expect(geocoder.resolveLocation).toHaveBeenCalledOnce();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.shipmentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shipmentId: 7,
        status: 'IN_TRANSIT',
        locationText: 'Porto Alegre',
      }),
    });
    expect(tx.shipment.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { status: 'IN_TRANSIT' },
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('del'"),
      1,
      'tracking:shipment:7',
      expect.any(String),
    );
  });

  it('keeps a delayed status update in history without rolling back current status', async () => {
    const { worker, tx } = harness();
    tx.shipment.findUnique.mockResolvedValue({ id: 7, status: 'TRANSFERRED' });
    tx.shipmentEvent.findFirst.mockResolvedValue({
      occurredAt: new Date('2026-01-03T00:00:00.000Z'),
    });

    await worker['processJob']({ data: { outboxId: 'outbox-1' } } as Job<{
      outboxId: string;
    }>);

    expect(tx.shipmentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'IN_TRANSIT' }),
    });
    expect(tx.shipment.update).not.toHaveBeenCalled();
  });

  it('records a location update using the current status', async () => {
    const { worker, prisma, tx } = harness();
    prisma.trackingOutbox.findUnique.mockResolvedValue({
      ...outbox,
      eventType: 'LOCATION',
    });

    await worker['processJob']({ data: { outboxId: 'outbox-1' } } as Job<{
      outboxId: string;
    }>);

    expect(tx.shipmentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'CREATED' }),
    });
    expect(tx.shipment.update).not.toHaveBeenCalled();
  });

  it('records the delivery timestamp when a transfer is delivered', async () => {
    const { worker, prisma, tx } = harness();
    tx.shipment.findUnique.mockResolvedValue({ id: 7, status: 'TRANSFERRED' });
    prisma.trackingOutbox.findUnique.mockResolvedValue({
      ...outbox,
      payload: outbox.payload.replace('IN_TRANSIT', 'DELIVERED'),
    });

    await worker['processJob']({ data: { outboxId: 'outbox-1' } } as Job<{
      outboxId: string;
    }>);

    expect(tx.shipment.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    });
  });

  it('releases the lock if the shipment was removed before processing', async () => {
    const { worker, tx, redis } = harness();
    tx.shipment.findUnique.mockResolvedValue(null);

    await expect(
      worker['processJob']({ data: { outboxId: 'outbox-1' } } as Job<{
        outboxId: string;
      }>),
    ).rejects.toThrow('Shipment 7 no longer exists');
    expect(redis.eval).toHaveBeenCalledOnce();
    expect(tx.shipmentEvent.create).not.toHaveBeenCalled();
  });

  it('skips an already processed event', async () => {
    const { worker, prisma, redis } = harness();
    prisma.trackingOutbox.findUnique.mockResolvedValue({
      ...outbox,
      processedAt: new Date(),
    });

    await worker['processJob']({ data: { outboxId: 'outbox-1' } } as Job<{
      outboxId: string;
    }>);

    expect(redis.set).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not append history if another worker already claimed the outbox item', async () => {
    const { worker, tx, redis } = harness();
    tx.trackingOutbox.updateMany.mockResolvedValue({ count: 0 });

    await worker['processJob']({ data: { outboxId: 'outbox-1' } } as Job<{
      outboxId: string;
    }>);

    expect(tx.shipmentEvent.create).not.toHaveBeenCalled();
    expect(tx.shipment.update).not.toHaveBeenCalled();
    expect(redis.eval).toHaveBeenCalledOnce();
  });

  it('fails when the shipment lock is held elsewhere', async () => {
    const { worker, redis, prisma } = harness();
    redis.set.mockResolvedValue(null);

    await expect(
      worker['processJob']({ data: { outboxId: 'outbox-1' } } as Job<{
        outboxId: string;
      }>),
    ).rejects.toThrow('Shipment 7 is currently locked');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('moves an expired retry to the DLQ and retains recent retries', async () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const { worker } = harness();
    const deadQueue = { add: vi.fn() };
    worker['deadQueue'] = deadQueue as unknown as Queue;
    const recent = {
      timestamp: Date.now(),
      data: { outboxId: 'recent' },
    } as Job<{ outboxId: string }>;
    const expired = {
      timestamp: Date.now() - 86_400_001,
      data: { outboxId: 'expired' },
    } as Job<{ outboxId: string }>;

    await worker['handleFailure'](recent, new Error('temporary'));
    expect(deadQueue.add).not.toHaveBeenCalled();
    await worker['handleFailure'](expired, new Error('persistent'));
    expect(deadQueue.add).toHaveBeenCalledWith(
      'replay',
      { outboxId: 'expired' },
      { jobId: 'dlq-expired' },
    );
    expect(log).toHaveBeenCalledExactlyOnceWith(
      'Tracking event expired moved to periodic DLQ replay after the retry window: Error: persistent',
    );
  });
});
