import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { TrackingOutboxWorkerService } from '../src/infrastructure/database/shipments/tracking-outbox-worker.service.js';
import { GEOCODING_PORT } from '../src/application/shipments/shipment.tokens.js';
import { GeocodingResultNotFoundError } from '../src/domain/shipments/errors/geocoding-result-not-found.error.js';
import { GeocodingProviderUnavailableError } from '../src/domain/shipments/errors/geocoding-provider-unavailable.error.js';

describe('Tracking (e2e)', () => {
  let app: INestApplication<App>;
  const originAddress =
    'Avenida Paulista, 1578, Bela Vista, São Paulo, SP, Brasil';
  const destinationAddress =
    'Avenida Atlântica, 1702, Copacabana, Rio de Janeiro, RJ, Brasil';
  const checkpointAddress = 'Praça da Sé, 1, Sé, São Paulo, SP, Brasil';
  const geocode = vi.fn(async (address: string) => {
    if (address === originAddress)
      return { latitude: -23.561414, longitude: -46.655881 };
    if (address === destinationAddress)
      return { latitude: -22.9675, longitude: -43.1792 };
    if (address === checkpointAddress)
      return { latitude: -23.550309, longitude: -46.6342 };
    if (address === 'Provider unavailable')
      throw new GeocodingProviderUnavailableError();
    throw new GeocodingResultNotFoundError();
  });
  const previousQueueSettings = {
    enabled: process.env.TRACKING_QUEUE_ENABLED,
    worker: process.env.TRACKING_WORKER_ROLE,
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    geocoderUrl: process.env.GEOCODER_URL,
    queueName: process.env.TRACKING_QUEUE_NAME,
    deadQueueName: process.env.TRACKING_DEAD_QUEUE_NAME,
  };
  const stamp = Date.now();
  const codeA = `E2E${stamp}A`;
  const codeD = `E2E${stamp}D`;
  const codeF = `E2E${stamp}F`;
  const codeG = `E2E${stamp}G`;

  const departure = new Date(Date.now() + 86_400_000).toISOString();
  const estimated = new Date(Date.now() + 8 * 86_400_000).toISOString();

  beforeAll(async () => {
    process.env.TRACKING_QUEUE_ENABLED = 'true';
    process.env.TRACKING_WORKER_ROLE = 'true';
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '6380';
    process.env.GEOCODER_URL = '';
    process.env.TRACKING_QUEUE_NAME = `tracking-events-e2e-${stamp}`;
    process.env.TRACKING_DEAD_QUEUE_NAME = `tracking-events-dlq-e2e-${stamp}`;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GEOCODING_PORT)
      .useValue({ geocode })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previousQueueSettings.enabled === undefined)
      delete process.env.TRACKING_QUEUE_ENABLED;
    else process.env.TRACKING_QUEUE_ENABLED = previousQueueSettings.enabled;
    if (previousQueueSettings.worker === undefined)
      delete process.env.TRACKING_WORKER_ROLE;
    else process.env.TRACKING_WORKER_ROLE = previousQueueSettings.worker;
    if (previousQueueSettings.host === undefined) delete process.env.REDIS_HOST;
    else process.env.REDIS_HOST = previousQueueSettings.host;
    if (previousQueueSettings.port === undefined) delete process.env.REDIS_PORT;
    else process.env.REDIS_PORT = previousQueueSettings.port;
    if (previousQueueSettings.geocoderUrl === undefined)
      delete process.env.GEOCODER_URL;
    else process.env.GEOCODER_URL = previousQueueSettings.geocoderUrl;
    if (previousQueueSettings.queueName === undefined)
      delete process.env.TRACKING_QUEUE_NAME;
    else process.env.TRACKING_QUEUE_NAME = previousQueueSettings.queueName;
    if (previousQueueSettings.deadQueueName === undefined)
      delete process.env.TRACKING_DEAD_QUEUE_NAME;
    else
      process.env.TRACKING_DEAD_QUEUE_NAME =
        previousQueueSettings.deadQueueName;
  });

  const server = (): App => app.getHttpServer();

  async function waitForHistory(
    locationText: string,
    cargoCode = codeA,
  ): Promise<void> {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const response = await request(server())
        .get(`/api/v1/tracking/${cargoCode}/historico`)
        .set('Authorization', `Bearer ${sergioToken}`);
      if (
        response.status === 200 &&
        response.body.data?.[0]?.locationText === locationText
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for tracking event at ${locationText}`);
  }

  let adminToken = '';
  let sergioToken = '';
  let taniaToken = '';
  let portalToken = '';
  let mariaId = 0;
  let joaoId = 0;
  let sergioId = 0;

  const createBody = (cargoCode: string) => ({
    cargoCode,
    originCity: 'São Paulo',
    originCountry: 'Brasil',
    originAddress,
    destinationCity: 'Rio de Janeiro',
    destinationCountry: 'Brasil',
    destinationAddress,
    departureDate: departure,
    estimatedDeliveryDate: estimated,
  });

  it('authenticates seeded profiles and resolves customer scopes', async () => {
    const adminLogin = await request(server())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@logistica.com', password: 'Senha123!' })
      .expect(200);
    adminToken = adminLogin.body.token;

    const sergioLogin = await request(server())
      .post('/api/v1/auth/login')
      .send({ email: 'sergio.nogueira@logistica.com', password: 'Senha123!' })
      .expect(200);
    sergioToken = sergioLogin.body.token;

    const taniaLogin = await request(server())
      .post('/api/v1/auth/login')
      .send({ email: 'tania.mendes@logistica.com', password: 'Senha123!' })
      .expect(200);
    taniaToken = taniaLogin.body.token;

    const portalLogin = await request(server())
      .post('/api/v1/auth/login')
      .send({ email: 'portal.maria@example.com', password: 'Senha123!' })
      .expect(200);
    portalToken = portalLogin.body.token;

    const sergioMe = await request(server())
      .get('/api/v1/operadores/me')
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(200);
    mariaId = sergioMe.body.customer.id;
    sergioId = sergioMe.body.id;

    const taniaMe = await request(server())
      .get('/api/v1/operadores/me')
      .set('Authorization', `Bearer ${taniaToken}`)
      .expect(200);
    joaoId = taniaMe.body.customer.id;

    expect(mariaId).toBeGreaterThan(0);
    expect(joaoId).toBeGreaterThan(0);
    expect(mariaId).not.toBe(joaoId);
  });

  it('GET /api/v1/tracking without token is rejected (401)', async () => {
    await request(server()).get('/api/v1/tracking').expect(401);
  });

  it('GET /api/v1/tracking/geocode requires a valid token', async () => {
    await request(server())
      .get('/api/v1/tracking/geocode')
      .query({ address: originAddress })
      .expect(401);
    await request(server())
      .get('/api/v1/tracking/geocode')
      .set('Authorization', 'Bearer invalid-token')
      .query({ address: originAddress })
      .expect(401);
  });

  it('GET /api/v1/tracking/geocode resolves addresses and maps failures', async () => {
    await request(server())
      .get('/api/v1/tracking/geocode')
      .set('Authorization', `Bearer ${portalToken}`)
      .query({ address: originAddress })
      .expect(200, { latitude: -23.561414, longitude: -46.655881 });

    await request(server())
      .get('/api/v1/tracking/geocode')
      .set('Authorization', `Bearer ${portalToken}`)
      .query({ address: 'x' })
      .expect(400);

    const missing = await request(server())
      .get('/api/v1/tracking/geocode')
      .set('Authorization', `Bearer ${portalToken}`)
      .query({ address: 'Unknown complete address' })
      .expect(404);
    expect(missing.body.code).toBe('GEOCODING_RESULT_NOT_FOUND');

    const unavailable = await request(server())
      .get('/api/v1/tracking/geocode')
      .set('Authorization', `Bearer ${portalToken}`)
      .query({ address: 'Provider unavailable' })
      .expect(503);
    expect(unavailable.body.code).toBe('GEOCODING_PROVIDER_UNAVAILABLE');
  });

  it('POST /api/v1/tracking creates a shipment scoped to the operator customer (201)', async () => {
    const response = await request(server())
      .post('/api/v1/tracking')
      .set('Authorization', `Bearer ${sergioToken}`)
      .send(createBody(codeA))
      .expect(201);

    expect(response.body).toMatchObject({
      cargoCode: codeA,
      status: 'CREATED',
      originAddress,
      originLatitude: -23.561414,
      originLongitude: -46.655881,
      destinationAddress,
      destinationLatitude: -22.9675,
      destinationLongitude: -43.1792,
      customerId: mariaId,
      handledById: sergioId,
    });
  });

  it('rejects location changes without an idempotency key', async () => {
    await request(server())
      .put(`/api/v1/tracking/${codeA}/localizacao`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .send({ locationText: 'Maceió, AL' })
      .expect(400);
  });

  it('POST /api/v1/tracking rejects duplicate cargo codes (409)', async () => {
    const response = await request(server())
      .post('/api/v1/tracking')
      .set('Authorization', `Bearer ${sergioToken}`)
      .send(createBody(codeA))
      .expect(409);

    expect(response.body.code).toBe('SHIPMENT_CARGO_CODE_IN_USE');
  });

  it('POST /api/v1/tracking rejects estimated delivery before departure (422)', async () => {
    const response = await request(server())
      .post('/api/v1/tracking')
      .set('Authorization', `Bearer ${sergioToken}`)
      .send({
        ...createBody(`E2E${stamp}X`),
        departureDate: estimated,
        estimatedDeliveryDate: departure,
      })
      .expect(422);

    expect(response.body.code).toBe('SHIPMENT_INVALID_DATES');
  });

  it('POST /api/v1/tracking denies CUSTOMER profiles (403)', async () => {
    const response = await request(server())
      .post('/api/v1/tracking')
      .set('Authorization', `Bearer ${portalToken}`)
      .send(createBody(`E2E${stamp}Y`))
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('GET /api/v1/tracking scopes operators to their own customer', async () => {
    const own = await request(server())
      .get('/api/v1/tracking')
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(200);

    expect(own.body.meta).toMatchObject({ page: 1, total: expect.any(Number) });
    expect(own.body.data.length).toBeGreaterThan(0);
    for (const shipment of own.body.data) {
      expect(shipment.customerId).toBe(mariaId);
    }
    expect(
      own.body.data.some(
        (shipment: { cargoCode: string }) => shipment.cargoCode === codeA,
      ),
    ).toBe(true);

    // The idCliente filter cannot escape the token scope.
    const filtered = await request(server())
      .get(`/api/v1/tracking?idCliente=${joaoId}`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(200);
    for (const shipment of filtered.body.data) {
      expect(shipment.customerId).toBe(mariaId);
    }
  });

  it('GET /api/v1/tracking supports combined admin filters', async () => {
    const response = await request(server())
      .get(`/api/v1/tracking?status=CREATED&idCliente=${mariaId}&limit=100`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    for (const shipment of response.body.data) {
      expect(shipment).toMatchObject({
        status: 'CREATED',
        customerId: mariaId,
      });
    }
    expect(
      response.body.data.some(
        (shipment: { cargoCode: string }) =>
          shipment.cargoCode === 'BR2026-0007',
      ),
    ).toBe(true);
  });

  it('GET /api/v1/tracking/:codigoCarga hides foreign-customer cargos (404)', async () => {
    // BR2026-0002 belongs to joao.souza: sergio (maria.silva) must not see it.
    const hidden = await request(server())
      .get('/api/v1/tracking/BR2026-0002')
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(404);
    expect(hidden.body.code).toBe('SHIPMENT_NOT_FOUND');

    const visible = await request(server())
      .get('/api/v1/tracking/BR2026-0002')
      .set('Authorization', `Bearer ${taniaToken}`)
      .expect(200);
    expect(visible.body).toMatchObject({
      cargoCode: 'BR2026-0002',
      status: 'IN_TRANSIT',
    });

    const portalOwn = await request(server())
      .get('/api/v1/tracking/BR2026-0001')
      .set('Authorization', `Bearer ${portalToken}`)
      .expect(200);
    expect(portalOwn.body).toMatchObject({
      cargoCode: 'BR2026-0001',
      customerId: mariaId,
    });

    const portalForeign = await request(server())
      .get('/api/v1/tracking/BR2026-0002')
      .set('Authorization', `Bearer ${portalToken}`)
      .expect(404);
    expect(portalForeign.body.code).toBe('SHIPMENT_NOT_FOUND');
  });

  it('GET /api/v1/tracking/status/:status lists cargos by status', async () => {
    const response = await request(server())
      .get('/api/v1/tracking/status/IN_TRANSIT?limit=100')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    for (const shipment of response.body.data) {
      expect(shipment.status).toBe('IN_TRANSIT');
    }
    expect(
      response.body.data.some(
        (shipment: { cargoCode: string }) =>
          shipment.cargoCode === 'BR2026-0002',
      ),
    ).toBe(true);
  });

  it('PUT /api/v1/tracking/:codigoCarga/status updates status and records history', async () => {
    const updated = await request(server())
      .put(`/api/v1/tracking/${codeA}/status`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .send({
        status: 'in_transit',
        locationText: 'Campinas, SP',
        latitude: -22.9056,
        longitude: -47.0608,
      })
      .expect(202);

    expect(updated.body).toMatchObject({ accepted: true, duplicate: false });
    await waitForHistory('Campinas, SP');

    const history = await request(server())
      .get(`/api/v1/tracking/${codeA}/historico`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(200);
    expect(history.body.meta.total).toBe(2);
    expect(history.body.data[0]).toMatchObject({
      status: 'IN_TRANSIT',
      locationText: 'Campinas, SP',
    });
    expect(history.body.data[1]).toMatchObject({ status: 'CREATED' });
  });

  it('PUT /api/v1/tracking/:codigoCarga/status rejects invalid transitions (422)', async () => {
    const response = await request(server())
      .put(`/api/v1/tracking/${codeA}/status`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .send({ status: 'CREATED', locationText: 'São Paulo, SP' })
      .expect(422);

    expect(response.body.code).toBe('SHIPMENT_INVALID_TRANSITION');
  });

  it('PUT /api/v1/tracking/:codigoCarga/status denies CUSTOMER profiles (403)', async () => {
    await request(server())
      .put(`/api/v1/tracking/${codeA}/status`)
      .set('Authorization', `Bearer ${portalToken}`)
      .send({ status: 'TRANSFERRED', locationText: 'Maceió, AL' })
      .expect(403);
  });

  it('PUT /api/v1/tracking/:codigoCarga/localizacao updates only the location', async () => {
    const payload = {
      locationText: checkpointAddress,
      notes: 'GPS ping',
    };
    const key = `e2e-${stamp}-location-a`;
    const updated = await request(server())
      .put(`/api/v1/tracking/${codeA}/localizacao`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(202);

    expect(updated.body).toMatchObject({ accepted: true, duplicate: false });
    await (
      app.get(TrackingOutboxWorkerService) as unknown as {
        processJob(job: { data: { outboxId: string } }): Promise<void>;
      }
    ).processJob({ data: { outboxId: updated.body.eventId } });
    await waitForHistory(checkpointAddress);
    expect(geocode).toHaveBeenCalledWith(checkpointAddress);

    const history = await request(server())
      .get(`/api/v1/tracking/${codeA}/historico`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(200);
    expect(history.body.meta.total).toBe(3);
    expect(history.body.data[0]).toMatchObject({
      status: 'IN_TRANSIT',
      locationText: checkpointAddress,
      latitude: -23.550309,
      longitude: -46.6342,
      notes: 'GPS ping',
    });

    const detail = await request(server())
      .get(`/api/v1/tracking/${codeA}`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      currentLocationText: checkpointAddress,
      currentLatitude: -23.550309,
      currentLongitude: -46.6342,
    });

    const repeated = await request(server())
      .put(`/api/v1/tracking/${codeA}/localizacao`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(202);
    expect(repeated.body).toMatchObject({
      eventId: updated.body.eventId,
      acceptedAt: updated.body.acceptedAt,
      duplicate: true,
    });
    await request(server())
      .put(`/api/v1/tracking/${codeA}/localizacao`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .set('Idempotency-Key', key)
      .send({ ...payload, locationText: 'Recife, PE' })
      .expect(409);

    const duplicateQueue = new Queue(`tracking-events-e2e-${stamp}`, {
      connection: { host: '127.0.0.1', port: 6380, maxRetriesPerRequest: null },
    });
    await duplicateQueue.add(
      'LOCATION',
      { outboxId: updated.body.eventId },
      { jobId: updated.body.eventId },
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    const afterDuplicate = await request(server())
      .get(`/api/v1/tracking/${codeA}/historico`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(200);
    expect(afterDuplicate.body.meta.total).toBe(3);
    await duplicateQueue.close();

    const simultaneousKey = `e2e-${stamp}-simultaneous`;
    const simultaneousPayload = {
      locationText: 'Concurrent location',
      notes: 'same request',
    };
    const [simultaneousA, simultaneousB] = await Promise.all([
      request(server())
        .put(`/api/v1/tracking/${codeA}/localizacao`)
        .set('Authorization', `Bearer ${sergioToken}`)
        .set('Idempotency-Key', simultaneousKey)
        .send(simultaneousPayload),
      request(server())
        .put(`/api/v1/tracking/${codeA}/localizacao`)
        .set('Authorization', `Bearer ${sergioToken}`)
        .set('Idempotency-Key', simultaneousKey)
        .send(simultaneousPayload),
    ]);
    expect(simultaneousA.status).toBe(202);
    expect(simultaneousB.status).toBe(202);
    expect(simultaneousA.body.eventId).toBe(simultaneousB.body.eventId);
    await waitForHistory('Concurrent location');
    const afterSimultaneous = await request(server())
      .get(`/api/v1/tracking/${codeA}/historico`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(200);
    expect(afterSimultaneous.body.meta.total).toBe(4);
  }, 15000);

  it('records out-of-order status events without replacing the newer shipment status', async () => {
    await request(server())
      .post('/api/v1/tracking')
      .set('Authorization', `Bearer ${sergioToken}`)
      .send(createBody(codeD))
      .expect(201);
    const newerAt = new Date(Date.now() + 120000).toISOString();
    const olderAt = new Date(Date.now() + 60000).toISOString();
    await request(server())
      .put(`/api/v1/tracking/${codeD}/status`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .send({
        status: 'IN_TRANSIT',
        locationText: 'New checkpoint',
        occurredAt: newerAt,
      })
      .expect(202);
    await waitForHistory('New checkpoint', codeD);
    await request(server())
      .put(`/api/v1/tracking/${codeD}/status`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .send({
        status: 'TRANSFERRED',
        locationText: 'Older checkpoint',
        occurredAt: olderAt,
      })
      .expect(202);
    const deadline = Date.now() + 10000;
    let history:
      { data: Array<{ locationText: string; status: string }> } | undefined;
    while (Date.now() < deadline) {
      const response = await request(server())
        .get(`/api/v1/tracking/${codeD}/historico`)
        .set('Authorization', `Bearer ${sergioToken}`);
      history = response.body;
      if (
        history?.data?.some(
          (event) => event.locationText === 'Older checkpoint',
        )
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(
      history?.data.some(
        (event) =>
          event.locationText === 'Older checkpoint' &&
          event.status === 'TRANSFERRED',
      ),
    ).toBe(true);
    const detail = await request(server())
      .get(`/api/v1/tracking/${codeD}`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(200);
    expect(detail.body.status).toBe('IN_TRANSIT');
  });

  it('retries a colliding per-shipment Redis lock and eventually processes the accepted event', async () => {
    await request(server())
      .post('/api/v1/tracking')
      .set('Authorization', `Bearer ${sergioToken}`)
      .send(createBody(codeF))
      .expect(201);
    const detail = await request(server())
      .get(`/api/v1/tracking/${codeF}`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(200);
    const redis = new Redis({ host: '127.0.0.1', port: 6380 });
    const lockKey = `tracking:shipment:${detail.body.id}`;
    await redis.set(lockKey, 'test-collision', 'PX', 10000);
    const accepted = await request(server())
      .put(`/api/v1/tracking/${codeF}/status`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .send({ status: 'IN_TRANSIT', locationText: 'Lock retry checkpoint' })
      .expect(202);
    expect(accepted.body.accepted).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await redis.del(lockKey);
    await waitForHistory('Lock retry checkpoint', codeF);
    const history = await request(server())
      .get(`/api/v1/tracking/${codeF}/historico`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(200);
    expect(history.body.meta.total).toBe(2);
    await redis.quit();
  });

  it('dispatches pending SQL outbox rows and replays an aged dead-letter job', async () => {
    await request(server())
      .post('/api/v1/tracking')
      .set('Authorization', `Bearer ${sergioToken}`)
      .send(createBody(codeG))
      .expect(201);
    const detail = await request(server())
      .get(`/api/v1/tracking/${codeG}`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(200);
    const prisma = app.get(PrismaService);
    const workerService = app.get(TrackingOutboxWorkerService) as unknown as {
      dispatchPending: () => Promise<void>;
      handleFailure: (
        job: { timestamp: number; data: { outboxId: string } },
        error: Error,
      ) => Promise<void>;
    };
    const pending = await prisma.trackingOutbox.create({
      data: {
        shipmentId: detail.body.id,
        eventType: 'LOCATION',
        payload: JSON.stringify({
          status: 'CREATED',
          locationText: 'Recovered outbox',
          latitude: null,
          longitude: null,
          notes: null,
          createdById: sergioId,
          occurredAt: new Date().toISOString(),
        }),
      },
    });
    await workerService.dispatchPending();
    await waitForHistory('Recovered outbox', codeG);

    const deadLetter = await prisma.trackingOutbox.create({
      data: {
        shipmentId: detail.body.id,
        eventType: 'LOCATION',
        payload: JSON.stringify({
          status: 'CREATED',
          locationText: 'DLQ replay',
          latitude: null,
          longitude: null,
          notes: null,
          createdById: sergioId,
          occurredAt: new Date().toISOString(),
        }),
      },
    });
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    try {
      await workerService.handleFailure(
        { timestamp: Date.now() - 86400001, data: { outboxId: deadLetter.id } },
        new Error('simulated retries exhausted'),
      );
      expect(log).toHaveBeenCalledWith(
        `Tracking event ${deadLetter.id} moved to periodic DLQ replay after the retry window: Error: simulated retries exhausted`,
      );
    } finally {
      log.mockRestore();
    }
    await waitForHistory('DLQ replay', codeG);
    const rows = await prisma.trackingOutbox.findMany({
      where: { id: { in: [pending.id, deadLetter.id] } },
    });
    expect(rows.every((row) => row.processedAt !== null)).toBe(true);
  });

  it('PUT /api/v1/tracking/:codigoCarga/entrega marks the shipment delivered', async () => {
    const delivered = await request(server())
      .put(`/api/v1/tracking/${codeA}/entrega`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .send({})
      .expect(200);

    expect(delivered.body).toMatchObject({
      cargoCode: codeA,
      status: 'DELIVERED',
      currentLocationText: 'Concurrent location',
    });
    expect(delivered.body.deliveredAt).toEqual(expect.any(String));

    const history = await request(server())
      .get(`/api/v1/tracking/${codeA}/historico`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(200);
    expect(history.body.meta.total).toBe(5);
    expect(history.body.data[0]).toMatchObject({ status: 'DELIVERED' });

    const again = await request(server())
      .put(`/api/v1/tracking/${codeA}/entrega`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .send({})
      .expect(422);
    expect(again.body.code).toBe('SHIPMENT_INVALID_TRANSITION');
  });

  it('GET /api/v1/historico is admin-only with a required time window', async () => {
    const windowed = await request(server())
      .get(
        '/api/v1/historico?inicio=2020-01-01T00:00:00.000Z&fim=2030-01-01T00:00:00.000Z',
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(windowed.body.meta.total).toBeGreaterThanOrEqual(12);
    expect(windowed.body.data.length).toBeGreaterThan(1);
    expect(
      new Date(windowed.body.data[0].occurredAt).getTime(),
    ).toBeGreaterThanOrEqual(
      new Date(windowed.body.data[1].occurredAt).getTime(),
    );

    const missing = await request(server())
      .get('/api/v1/historico')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(422);
    expect(missing.body.code).toBe('SHIPMENT_INVALID');

    const forbidden = await request(server())
      .get('/api/v1/historico?inicio=2020-01-01T00:00:00.000Z')
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
  });

  it('POST /api/v1/historico/:codigoCarga records manual admin occurrences', async () => {
    const created = await request(server())
      .post(`/api/v1/historico/${codeA}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        locationText: 'Manual checkpoint',
        notes: 'Support note',
        occurredAt: '2026-09-10T10:00:00.000Z',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      status: 'DELIVERED',
      locationText: 'Manual checkpoint',
      notes: 'Support note',
      occurredAt: '2026-09-10T10:00:00.000Z',
    });

    const detail = await request(server())
      .get(`/api/v1/tracking/${codeA}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.status).toBe('DELIVERED');

    await request(server())
      .post(`/api/v1/historico/${codeA}`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .send({ locationText: 'X' })
      .expect(403);
  });

  it('GET /api/v1/tracking validates pagination caps and status values', async () => {
    await request(server())
      .get('/api/v1/tracking?limit=101')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    const invalid = await request(server())
      .get('/api/v1/tracking?status=LOST')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(422);
    expect(invalid.body.code).toBe('SHIPMENT_INVALID');
  });

  it('DELETE /api/v1/tracking/:codigoCarga removes own-customer cargos only', async () => {
    await request(server())
      .delete(`/api/v1/tracking/${codeD}`)
      .set('Authorization', `Bearer ${taniaToken}`)
      .expect(404);
    await request(server())
      .delete(`/api/v1/tracking/${codeD}`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(204);

    const gone = await request(server())
      .get(`/api/v1/tracking/${codeD}`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(404);
    expect(gone.body.code).toBe('SHIPMENT_NOT_FOUND');
    await request(server())
      .delete(`/api/v1/tracking/${codeF}`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(204);
    await request(server())
      .delete(`/api/v1/tracking/${codeG}`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(204);
  });

  it('DELETE /api/v1/tracking/:codigoCarga removes the delivered cargo and its history', async () => {
    await request(server())
      .delete(`/api/v1/tracking/${codeA}`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(204);

    await request(server())
      .get(`/api/v1/tracking/${codeA}`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(404);
    await request(server())
      .get(`/api/v1/tracking/${codeA}/historico`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .expect(404);
  });
});
