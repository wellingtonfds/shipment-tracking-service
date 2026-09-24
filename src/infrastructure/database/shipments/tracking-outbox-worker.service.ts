import {
  Injectable,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBullBoard, type BullBoardInstance } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { Job, Queue, Worker } from 'bullmq';
import { BullMQOtel } from 'bullmq-otel';
import { Redis } from 'ioredis';
import { assertTransition } from '../../../domain/shipments/shipment.entity.js';
import type { GeocodingPort } from '../../../application/shipments/ports/geocoding.port.js';
import { GEOCODING_PORT } from '../../../application/shipments/shipment.tokens.js';
import type { AppConfig, TrackingConfig } from '../../config/configuration.js';
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
  private backlogTimer?: NodeJS.Timeout;
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
    @InjectBullBoard() private readonly bullBoard: BullBoardInstance,
    @Inject(GEOCODING_PORT) private readonly geocoder: GeocodingPort,
  ) {}

  private get tracking(): TrackingConfig {
    return this.config.getOrThrow<TrackingConfig>('tracking');
  }

  async onModuleInit(): Promise<void> {
    const tracking = this.tracking;
    if (!tracking.queueEnabled) return;
    const host = tracking.redis.host;
    if (!host)
      throw new Error(
        'REDIS_HOST is required when TRACKING_QUEUE_ENABLED=true',
      );
    this.redis = new Redis({
      host,
      port: tracking.redis.port,
      password: tracking.redis.password,
      tls: tracking.redis.tls ? {} : undefined,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    await this.redis.connect();
    this.redis.on('error', (error: Error) =>
      this.logger.error(
        { component: 'tracking-worker', event: 'redis.error', error: error.message },
        'Redis connection error',
      ),
    );
    const connection = {
      host,
      port: tracking.redis.port,
      password: tracking.redis.password,
      tls: tracking.redis.tls ? {} : undefined,
      maxRetriesPerRequest: null as null,
    };
    this.queue = new Queue(tracking.queueName, {
      connection,
      telemetry: new BullMQOtel({
        tracerName: 'shipment-tracking.bullmq',
        meterName: 'shipment-tracking.bullmq',
        enableMetrics: true,
      }),
      defaultJobOptions: {
        attempts: 1000,
        backoff: { type: 'tracking-jitter', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    });
    this.deadQueue = new Queue(tracking.deadQueueName, {
      connection,
      telemetry: new BullMQOtel({
        tracerName: 'shipment-tracking.bullmq',
        meterName: 'shipment-tracking.bullmq',
        enableMetrics: true,
      }),
      defaultJobOptions: {
        attempts: 1000,
        backoff: {
          type: 'fixed',
          delay: tracking.dlqReplayIntervalMs,
        },
        removeOnFail: false,
      },
    });
    this.bullBoard.addQueue(new BullMQAdapter(this.queue));
    this.bullBoard.addQueue(new BullMQAdapter(this.deadQueue));
    if (tracking.workerRole) {
      this.worker = new Worker(
        tracking.queueName,
        (job) => this.processJob(job),
        {
          connection,
          telemetry: new BullMQOtel({
            tracerName: 'shipment-tracking.bullmq',
            meterName: 'shipment-tracking.bullmq',
            enableMetrics: true,
          }),
          concurrency: tracking.workerConcurrency,
          settings: {
            backoffStrategy: (attemptsMade: number) => {
              const cap = tracking.backoffMaxMs;
              const base = Math.min(
                cap,
                1000 * 2 ** Math.min(attemptsMade - 1, 20),
              );
              return Math.min(cap, Math.floor(base * (0.5 + Math.random())));
            },
          },
        },
      );
      this.deadWorker = new Worker(
        tracking.deadQueueName,
        (job) => this.processJob(job),
        {
          connection,
          telemetry: new BullMQOtel({
            tracerName: 'shipment-tracking.bullmq',
            meterName: 'shipment-tracking.bullmq',
            enableMetrics: true,
          }),
          concurrency: 1,
          limiter: {
            max: 1,
            duration: tracking.dlqReplayIntervalMs,
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
    if (tracking.dispatcherRole) {
      this.dispatchTimer = setInterval(
        () => void this.dispatchPending(),
        tracking.outboxPollIntervalMs,
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
    this.backlogTimer = setInterval(() => void this.logBacklogs(), 60_000);
    this.backlogTimer.unref();
    await this.logBacklogs();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dispatchTimer) clearInterval(this.dispatchTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.backlogTimer) clearInterval(this.backlogTimer);
    if (this.tracking.workerRole)
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
        Date.now() - this.tracking.outboxRedisReconcileMs,
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
        this.logger.log(
          {
            component: 'tracking-dispatcher',
            event: 'tracking.dispatch.completed',
            outboxId: item.id,
            shipmentId: item.shipmentId,
            queue: this.tracking.queueName,
          },
          'Tracking event dispatched',
        );
      }
    } catch (error) {
      this.logger.error(
        { component: 'tracking-dispatcher', event: 'tracking.dispatch.failed', error: String(error) },
        'Outbox dispatch failed',
      );
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
      this.tracking.lockTtlMs,
      'NX',
    );
    if (acquired !== 'OK') {
      this.logger.warn(
        {
          component: 'tracking-worker',
          event: 'tracking.lock.unavailable',
          shipmentId: outbox.shipmentId,
        },
        'Shipment lock unavailable',
      );
      throw new Error(`Shipment ${outbox.shipmentId} is currently locked`);
    }
    const lockTtl = this.tracking.lockTtlMs;
    const renewTimer = setInterval(
      () =>
        void this.redis!.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
          1,
          lockKey,
          lockToken,
          lockTtl,
        ).catch((error: unknown) =>
          this.logger.error(
            {
              component: 'tracking-worker',
              event: 'tracking.lock.renewal_failed',
              shipmentId: outbox.shipmentId,
              error: String(error),
            },
            'Shipment lock renewal failed',
          ),
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

  private async handleFailure(
    job: Job<{ outboxId: string }>,
    error: Error,
  ): Promise<void> {
    const maxAge = this.tracking.retryWindowMs;
    if (Date.now() - job.timestamp < maxAge) return;
    if (!this.deadQueue) return;
    await this.deadQueue.add('replay', job.data, {
      jobId: `dlq-${job.data.outboxId}`,
    });
    this.logger.error(
      {
        component: 'tracking-worker',
        event: 'tracking.dlq.enqueued',
        outboxId: job.data.outboxId,
        queue: this.tracking.deadQueueName,
        error: error.message,
      },
      'Tracking event moved to periodic DLQ replay',
    );
  }

  private async logBacklogs(): Promise<void> {
    const queues = [this.queue, this.deadQueue].filter(
      (queue): queue is Queue => queue !== undefined,
    );
    await Promise.all(
      queues.map(async (queue) => {
        try {
          const counts = await queue.getJobCounts('waiting', 'delayed', 'failed');
          const backlog = counts.waiting + counts.delayed + counts.failed;
          this.logger.log(
            {
              component: 'tracking-queue',
              event: 'bullmq.backlog',
              queue: queue.name,
              waiting: counts.waiting,
              delayed: counts.delayed,
              failed: counts.failed,
              backlog,
            },
            'BullMQ queue backlog collected',
          );
        } catch (error) {
          this.logger.error(
            { component: 'tracking-queue', event: 'bullmq.backlog.failed', queue: queue.name, error: String(error) },
            'BullMQ queue backlog collection failed',
          );
        }
      }),
    );
  }

  private async resolveLocation(
    location: TrackingPayload,
  ): Promise<TrackingPayload> {
    if (location.latitude !== null && location.longitude !== null)
      return location;
    try {
      return {
        ...location,
        ...(await this.geocoder.geocode(location.locationText)),
      };
    } catch (error) {
      this.logger.warn(
        `Geocoding failed; retaining textual location: ${String(error)}`,
      );
      return location;
    }
  }
}
