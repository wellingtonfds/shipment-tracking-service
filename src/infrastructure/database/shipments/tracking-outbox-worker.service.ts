import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { Job, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { assertTransition } from '../../../domain/shipments/shipment.entity.js';
import { PrismaService } from '../prisma.service.js';

interface TrackingPayload {
  status: string;
  locationText: string;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  createdById: number;
  occurredAt: string;
}

const QUEUE_NAME = 'tracking-events';
const DEAD_QUEUE_NAME = 'tracking-events-dlq';

@Injectable()
export class TrackingOutboxWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TrackingOutboxWorkerService.name);
  private redis?: Redis;
  private queue?: Queue;
  private deadQueue?: Queue;
  private worker?: Worker;
  private deadWorker?: Worker;
  private dispatchTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private dispatching = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.TRACKING_QUEUE_ENABLED !== 'true') return;
    const host = process.env.REDIS_HOST;
    if (!host)
      throw new Error(
        'REDIS_HOST is required when TRACKING_QUEUE_ENABLED=true',
      );
    this.redis = new Redis({
      host,
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    await this.redis.connect();
    const connection = {
      host,
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
      maxRetriesPerRequest: null as null,
    };
    this.queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 1000,
        backoff: { type: 'tracking-jitter', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    });
    this.deadQueue = new Queue(DEAD_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 1000,
        backoff: {
          type: 'fixed',
          delay: Number(process.env.DLQ_REPLAY_INTERVAL_MS ?? 86400000),
        },
        removeOnFail: false,
      },
    });
    if (process.env.TRACKING_WORKER_ROLE === 'true') {
      this.worker = new Worker(QUEUE_NAME, (job) => this.processJob(job), {
        connection,
        concurrency: Number(process.env.TRACKING_WORKER_CONCURRENCY ?? 8),
        settings: {
          backoffStrategy: (attemptsMade: number) => {
            const cap = Number(process.env.TRACKING_BACKOFF_MAX_MS ?? 3600000);
            const base = Math.min(
              cap,
              1000 * 2 ** Math.min(attemptsMade - 1, 20),
            );
            return Math.min(cap, Math.floor(base * (0.5 + Math.random())));
          },
        },
      });
      this.deadWorker = new Worker(
        DEAD_QUEUE_NAME,
        (job) => this.processJob(job),
        {
          connection,
          concurrency: 1,
          limiter: {
            max: 1,
            duration: Number(process.env.DLQ_REPLAY_INTERVAL_MS ?? 86400000),
          },
        },
      );
      this.worker.on('failed', (job, error) => {
        if (job)
          void this.handleFailure(job, error).catch((failure: unknown) =>
            this.logger.error(`DLQ handoff failed: ${String(failure)}`),
          );
      });
      this.worker.on('ready', () => this.writeHeartbeat());
      this.heartbeatTimer = setInterval(() => this.writeHeartbeat(), 10000);
      this.heartbeatTimer.unref();
      this.deadWorker.on('failed', (job, error) =>
        this.logger.error(
          `DLQ replay ${job?.id ?? 'unknown'} failed: ${String(error)}`,
        ),
      );
    }
    if (process.env.TRACKING_DISPATCHER_ROLE !== 'false') {
      this.dispatchTimer = setInterval(
        () => void this.dispatchPending(),
        Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000),
      );
      this.dispatchTimer.unref();
      await this.dispatchPending();
    }
    this.cleanupTimer = setInterval(
      () =>
        void this.prisma.trackingIdempotencyKey
          .deleteMany({ where: { expiresAt: { lte: new Date() } } })
          .catch((error: unknown) =>
            this.logger.error(`Idempotency cleanup failed: ${String(error)}`),
          ),
      60 * 60 * 1000,
    );
    this.cleanupTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dispatchTimer) clearInterval(this.dispatchTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (process.env.TRACKING_WORKER_ROLE === 'true')
      rmSync('/tmp/tracking-worker-health', { force: true });
    await Promise.all([
      this.worker?.close(),
      this.deadWorker?.close(),
      this.queue?.close(),
      this.deadQueue?.close(),
    ]);
    await this.redis?.quit();
  }

  private writeHeartbeat(): void {
    try {
      writeFileSync('/tmp/tracking-worker-health', String(Date.now()));
    } catch (error) {
      this.logger.error(`Worker heartbeat update failed: ${String(error)}`);
    }
  }

  private async dispatchPending(): Promise<void> {
    if (this.dispatching || !this.queue) return;
    this.dispatching = true;
    try {
      const reconciliationCutoff = new Date(
        Date.now() - Number(process.env.OUTBOX_REDIS_RECONCILE_MS ?? 60000),
      );
      const batch = await this.prisma.trackingOutbox.findMany({
        where: {
          processedAt: null,
          OR: [
            { dispatchedAt: null },
            { dispatchedAt: { lte: reconciliationCutoff } },
          ],
        },
        orderBy: [{ dispatchedAt: 'asc' }, { createdAt: 'asc' }],
        take: 100,
      });
      for (const item of batch) {
        const existing = await this.queue.getJob(item.id);
        if (existing) {
          const state = await existing.getState();
          if (
            state === 'waiting' ||
            state === 'active' ||
            state === 'delayed' ||
            state === 'waiting-children'
          ) {
            await this.prisma.trackingOutbox.updateMany({
              where: { id: item.id, processedAt: null },
              data: { dispatchedAt: new Date() },
            });
            continue;
          }
          await existing.remove();
        }
        await this.queue.add(
          item.eventType,
          { outboxId: item.id },
          { jobId: item.id },
        );
        await this.prisma.trackingOutbox.updateMany({
          where: { id: item.id, processedAt: null },
          data: { dispatchedAt: new Date(), attempts: { increment: 1 } },
        });
      }
    } catch (error) {
      this.logger.error(`Outbox dispatch failed: ${String(error)}`);
    } finally {
      this.dispatching = false;
    }
  }

  private async processJob(job: Job<{ outboxId: string }>): Promise<void> {
    const outbox = await this.prisma.trackingOutbox.findUnique({
      where: { id: job.data.outboxId },
    });
    if (!outbox || outbox.processedAt) return;
    const lockKey = `tracking:shipment:${outbox.shipmentId}`;
    const lockToken = randomUUID();
    const acquired = await this.redis!.set(
      lockKey,
      lockToken,
      'PX',
      Number(process.env.TRACKING_LOCK_TTL_MS ?? 120000),
      'NX',
    );
    if (acquired !== 'OK')
      throw new Error(`Shipment ${outbox.shipmentId} is currently locked`);
    const lockTtl = Number(process.env.TRACKING_LOCK_TTL_MS ?? 120000);
    const renewTimer = setInterval(
      () =>
        void this.redis!.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
          1,
          lockKey,
          lockToken,
          lockTtl,
        ).catch((error: unknown) =>
          this.logger.error(`Shipment lock renewal failed: ${String(error)}`),
        ),
      Math.max(1000, Math.floor(lockTtl / 3)),
    );
    try {
      const payload = JSON.parse(outbox.payload) as TrackingPayload;
      const location = await this.resolveLocation(payload);
      await this.prisma.$transaction(
        async (tx) => {
          const claimed = await tx.trackingOutbox.updateMany({
            where: { id: outbox.id, processedAt: null },
            data: { processedAt: new Date() },
          });
          if (claimed.count === 0) return;
          const current = await tx.shipment.findUnique({
            where: { id: outbox.shipmentId },
          });
          if (!current)
            throw new Error(`Shipment ${outbox.shipmentId} no longer exists`);
          const occurredAt = new Date(payload.occurredAt);
          const latest = await tx.shipmentEvent.findFirst({
            where: { shipmentId: outbox.shipmentId },
            orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          });
          const isLatest =
            !latest || occurredAt.getTime() >= latest.occurredAt.getTime();
          const eventStatus =
            outbox.eventType === 'STATUS' ? payload.status : current.status;
          if (outbox.eventType === 'STATUS' && isLatest)
            assertTransition(current.status as never, payload.status as never);
          await tx.shipmentEvent.create({
            data: {
              shipmentId: outbox.shipmentId,
              status: eventStatus,
              occurredAt,
              locationText: location.locationText,
              latitude: location.latitude,
              longitude: location.longitude,
              notes: payload.notes,
              createdById: payload.createdById,
            },
          });
          if (outbox.eventType === 'STATUS' && isLatest) {
            await tx.shipment.update({
              where: { id: current.id },
              data: {
                status: payload.status,
                ...(payload.status === 'DELIVERED'
                  ? { deliveredAt: occurredAt }
                  : {}),
              },
            });
          }
        },
        { isolationLevel: 'Serializable' },
      );
    } finally {
      clearInterval(renewTimer);
      await this.redis!.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockKey,
        lockToken,
      );
    }
  }

  private async resolveLocation(
    payload: TrackingPayload,
  ): Promise<Pick<TrackingPayload, 'locationText' | 'latitude' | 'longitude'>> {
    if (payload.latitude !== null && payload.longitude !== null) return payload;
    const endpoint = process.env.GEOCODER_URL;
    if (!endpoint) return payload;
    const cooldown = Number(process.env.GEOCODER_CIRCUIT_COOLDOWN_MS ?? 30000);
    const cacheKey = `tracking:geocode:${createHash('sha256').update(`${endpoint}:${payload.locationText.toLowerCase().trim()}`).digest('hex')}`;
    const cached = await this.redis!.get(cacheKey);
    if (cached)
      return {
        ...payload,
        ...(JSON.parse(cached) as { latitude: number; longitude: number }),
      };
    const circuitKey = 'tracking:geocode:circuit:open';
    if (await this.redis!.get(circuitKey)) return payload;
    const halfOpenKey = 'tracking:geocode:circuit:half-open';
    const hasOpenedBefore = await this.redis!.get(
      'tracking:geocode:circuit:ever-opened',
    );
    let isProbe = false;
    if (hasOpenedBefore) {
      const halfOpen = await this.redis!.set(
        halfOpenKey,
        randomUUID(),
        'PX',
        Number(process.env.GEOCODER_TIMEOUT_MS ?? 3000) + 1000,
        'NX',
      );
      if (halfOpen !== 'OK') return payload;
      isProbe = true;
    }
    const failuresKey = 'tracking:geocode:circuit:failures';
    try {
      await this.waitForGeocodeSlot();
      const url = new URL(endpoint);
      url.searchParams.set('q', payload.locationText);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');
      const headers: Record<string, string> = {
        'User-Agent': process.env.GEOCODER_USER_AGENT ?? 'tracking-api/1.0',
      };
      if (process.env.GEOCODER_API_KEY)
        headers.Authorization = `Bearer ${process.env.GEOCODER_API_KEY}`;
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(
          Number(process.env.GEOCODER_TIMEOUT_MS ?? 3000),
        ),
      });
      if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
      const results = (await response.json()) as Array<{
        lat: string;
        lon: string;
      }>;
      await this.redis!.del(
        failuresKey,
        circuitKey,
        halfOpenKey,
        'tracking:geocode:circuit:ever-opened',
      );
      const first = results[0];
      if (!first) return payload;
      const coordinates = {
        latitude: Number(first.lat),
        longitude: Number(first.lon),
      };
      if (
        !Number.isFinite(coordinates.latitude) ||
        !Number.isFinite(coordinates.longitude) ||
        coordinates.latitude < -90 ||
        coordinates.latitude > 90 ||
        coordinates.longitude < -180 ||
        coordinates.longitude > 180
      )
        return payload;
      await this.redis!.set(
        cacheKey,
        JSON.stringify(coordinates),
        'EX',
        Number(process.env.GEOCODER_CACHE_TTL_SECONDS ?? 2592000),
      );
      return { ...payload, ...coordinates };
    } catch (error) {
      const failures = await this.redis!.incr(failuresKey);
      if (failures === 1) await this.redis!.pexpire(failuresKey, cooldown);
      if (
        failures >= Number(process.env.GEOCODER_CIRCUIT_FAILURES ?? 5) ||
        isProbe
      ) {
        await this.redis!.set(circuitKey, 'open', 'PX', cooldown);
        await this.redis!.set('tracking:geocode:circuit:ever-opened', '1');
        await this.redis!.del(failuresKey);
      }
      if (isProbe) await this.redis!.del(halfOpenKey);
      this.logger.warn(
        `Geocoder unavailable; retaining textual location: ${String(error)}`,
      );
      return payload;
    }
  }

  private async waitForGeocodeSlot(): Promise<void> {
    const windowMs = 1000;
    const maxRequests = Math.max(
      1,
      Number(process.env.GEOCODE_RATE_LIMIT ?? 1),
    );
    const key = 'tracking:geocode:rate-limit';
    const script =
      "local now=tonumber(ARGV[1]); local window=tonumber(ARGV[2]); local limit=tonumber(ARGV[3]); redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now-window); local count=redis.call('ZCARD',KEYS[1]); if count < limit then redis.call('ZADD',KEYS[1],now,ARGV[4]); redis.call('PEXPIRE',KEYS[1],window); return 0 end; local first=redis.call('ZRANGE',KEYS[1],0,0,'WITHSCORES'); return tonumber(first[2])+window-now";
    while (true) {
      const waitMs = Number(
        await this.redis!.eval(
          script,
          1,
          key,
          Date.now(),
          windowMs,
          maxRequests,
          randomUUID(),
        ),
      );
      if (waitMs <= 0) return;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  private async handleFailure(
    job: Job<{ outboxId: string }>,
    error: Error,
  ): Promise<void> {
    const maxAge = Number(process.env.TRACKING_RETRY_WINDOW_MS ?? 86400000);
    if (Date.now() - job.timestamp < maxAge) return;
    if (!this.deadQueue) return;
    await this.deadQueue.add('replay', job.data, {
      jobId: `dlq-${job.data.outboxId}`,
    });
    this.logger.error(
      `Tracking event ${job.data.outboxId} moved to periodic DLQ replay after the retry window: ${String(error)}`,
    );
  }
}
