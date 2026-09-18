import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('Tracking (e2e)', () => {
  let app: INestApplication<App>;
  const stamp = Date.now();
  const codeA = `E2E${stamp}A`;
  const codeD = `E2E${stamp}D`;

  const departure = new Date(Date.now() + 86_400_000).toISOString();
  const estimated = new Date(Date.now() + 8 * 86_400_000).toISOString();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
  });

  const server = (): App => app.getHttpServer();

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
    destinationCity: 'Rio de Janeiro',
    destinationCountry: 'Brasil',
    departureDate: departure,
    estimatedDeliveryDate: estimated,
  });

  it('authenticates seeded profiles and resolves customer scopes', async () => {
    const adminLogin = await request(server()).post('/api/v1/auth/login').send({ email: 'admin@logistica.com', password: 'Senha123!' }).expect(200);
    adminToken = adminLogin.body.token;

    const sergioLogin = await request(server()).post('/api/v1/auth/login').send({ email: 'sergio.nogueira@logistica.com', password: 'Senha123!' }).expect(200);
    sergioToken = sergioLogin.body.token;

    const taniaLogin = await request(server()).post('/api/v1/auth/login').send({ email: 'tania.mendes@logistica.com', password: 'Senha123!' }).expect(200);
    taniaToken = taniaLogin.body.token;

    const portalLogin = await request(server()).post('/api/v1/auth/login').send({ email: 'portal.maria@example.com', password: 'Senha123!' }).expect(200);
    portalToken = portalLogin.body.token;

    const sergioMe = await request(server()).get('/api/v1/operadores/me').set('Authorization', `Bearer ${sergioToken}`).expect(200);
    mariaId = sergioMe.body.customer.id;
    sergioId = sergioMe.body.id;

    const taniaMe = await request(server()).get('/api/v1/operadores/me').set('Authorization', `Bearer ${taniaToken}`).expect(200);
    joaoId = taniaMe.body.customer.id;

    expect(mariaId).toBeGreaterThan(0);
    expect(joaoId).toBeGreaterThan(0);
    expect(mariaId).not.toBe(joaoId);
  });

  it('GET /api/v1/tracking without token is rejected (401)', async () => {
    await request(server()).get('/api/v1/tracking').expect(401);
  });

  it('POST /api/v1/tracking creates a shipment scoped to the operator customer (201)', async () => {
    const response = await request(server()).post('/api/v1/tracking').set('Authorization', `Bearer ${sergioToken}`).send(createBody(codeA)).expect(201);

    expect(response.body).toMatchObject({ cargoCode: codeA, status: 'CREATED', customerId: mariaId, handledById: sergioId });
  });

  it('POST /api/v1/tracking rejects duplicate cargo codes (409)', async () => {
    const response = await request(server()).post('/api/v1/tracking').set('Authorization', `Bearer ${sergioToken}`).send(createBody(codeA)).expect(409);

    expect(response.body.code).toBe('SHIPMENT_CARGO_CODE_IN_USE');
  });

  it('POST /api/v1/tracking rejects estimated delivery before departure (422)', async () => {
    const response = await request(server())
      .post('/api/v1/tracking')
      .set('Authorization', `Bearer ${sergioToken}`)
      .send({ ...createBody(`E2E${stamp}X`), departureDate: estimated, estimatedDeliveryDate: departure })
      .expect(422);

    expect(response.body.code).toBe('SHIPMENT_INVALID_DATES');
  });

  it('POST /api/v1/tracking denies CUSTOMER profiles (403)', async () => {
    const response = await request(server()).post('/api/v1/tracking').set('Authorization', `Bearer ${portalToken}`).send(createBody(`E2E${stamp}Y`)).expect(403);

    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('GET /api/v1/tracking scopes operators to their own customer', async () => {
    const own = await request(server()).get('/api/v1/tracking').set('Authorization', `Bearer ${sergioToken}`).expect(200);

    expect(own.body.meta).toMatchObject({ page: 1, total: expect.any(Number) });
    expect(own.body.data.length).toBeGreaterThan(0);
    for (const shipment of own.body.data) {
      expect(shipment.customerId).toBe(mariaId);
    }
    expect(own.body.data.some((shipment: { cargoCode: string }) => shipment.cargoCode === codeA)).toBe(true);

    // The idCliente filter cannot escape the token scope.
    const filtered = await request(server()).get(`/api/v1/tracking?idCliente=${joaoId}`).set('Authorization', `Bearer ${sergioToken}`).expect(200);
    for (const shipment of filtered.body.data) {
      expect(shipment.customerId).toBe(mariaId);
    }
  });

  it('GET /api/v1/tracking supports combined admin filters', async () => {
    const response = await request(server()).get(`/api/v1/tracking?status=CREATED&idCliente=${mariaId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    for (const shipment of response.body.data) {
      expect(shipment).toMatchObject({ status: 'CREATED', customerId: mariaId });
    }
    expect(response.body.data.some((shipment: { cargoCode: string }) => shipment.cargoCode === 'BR2026-0007')).toBe(true);
  });

  it('GET /api/v1/tracking/:codigoCarga hides foreign-customer cargos (404)', async () => {
    // BR2026-0002 belongs to joao.souza: sergio (maria.silva) must not see it.
    const hidden = await request(server()).get('/api/v1/tracking/BR2026-0002').set('Authorization', `Bearer ${sergioToken}`).expect(404);
    expect(hidden.body.code).toBe('SHIPMENT_NOT_FOUND');

    const visible = await request(server()).get('/api/v1/tracking/BR2026-0002').set('Authorization', `Bearer ${taniaToken}`).expect(200);
    expect(visible.body).toMatchObject({ cargoCode: 'BR2026-0002', status: 'IN_TRANSIT' });

    const portalOwn = await request(server()).get('/api/v1/tracking/BR2026-0001').set('Authorization', `Bearer ${portalToken}`).expect(200);
    expect(portalOwn.body).toMatchObject({ cargoCode: 'BR2026-0001', customerId: mariaId });

    const portalForeign = await request(server()).get('/api/v1/tracking/BR2026-0002').set('Authorization', `Bearer ${portalToken}`).expect(404);
    expect(portalForeign.body.code).toBe('SHIPMENT_NOT_FOUND');
  });

  it('GET /api/v1/tracking/status/:status lists cargos by status', async () => {
    const response = await request(server()).get('/api/v1/tracking/status/IN_TRANSIT').set('Authorization', `Bearer ${adminToken}`).expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    for (const shipment of response.body.data) {
      expect(shipment.status).toBe('IN_TRANSIT');
    }
    expect(response.body.data.some((shipment: { cargoCode: string }) => shipment.cargoCode === 'BR2026-0002')).toBe(true);
  });

  it('PUT /api/v1/tracking/:codigoCarga/status updates status and records history', async () => {
    const updated = await request(server())
      .put(`/api/v1/tracking/${codeA}/status`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .send({ status: 'in_transit', locationText: 'Campinas, SP', latitude: -22.9056, longitude: -47.0608 })
      .expect(200);

    expect(updated.body).toMatchObject({ cargoCode: codeA, status: 'IN_TRANSIT', currentLocationText: 'Campinas, SP' });

    const history = await request(server()).get(`/api/v1/tracking/${codeA}/historico`).set('Authorization', `Bearer ${sergioToken}`).expect(200);
    expect(history.body.meta.total).toBe(2);
    expect(history.body.data[0]).toMatchObject({ status: 'IN_TRANSIT', locationText: 'Campinas, SP' });
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
    const updated = await request(server())
      .put(`/api/v1/tracking/${codeA}/localizacao`)
      .set('Authorization', `Bearer ${sergioToken}`)
      .send({ locationText: 'Maceió, AL', latitude: -9.6658, longitude: -35.7353, notes: 'GPS ping' })
      .expect(200);

    expect(updated.body).toMatchObject({ cargoCode: codeA, status: 'IN_TRANSIT', currentLocationText: 'Maceió, AL' });

    const history = await request(server()).get(`/api/v1/tracking/${codeA}/historico`).set('Authorization', `Bearer ${sergioToken}`).expect(200);
    expect(history.body.meta.total).toBe(3);
    expect(history.body.data[0]).toMatchObject({ status: 'IN_TRANSIT', locationText: 'Maceió, AL', notes: 'GPS ping' });
  });

  it('PUT /api/v1/tracking/:codigoCarga/entrega marks the shipment delivered', async () => {
    const delivered = await request(server()).put(`/api/v1/tracking/${codeA}/entrega`).set('Authorization', `Bearer ${sergioToken}`).send({}).expect(200);

    expect(delivered.body).toMatchObject({ cargoCode: codeA, status: 'DELIVERED', currentLocationText: 'Maceió, AL' });
    expect(delivered.body.deliveredAt).toEqual(expect.any(String));

    const history = await request(server()).get(`/api/v1/tracking/${codeA}/historico`).set('Authorization', `Bearer ${sergioToken}`).expect(200);
    expect(history.body.meta.total).toBe(4);
    expect(history.body.data[0]).toMatchObject({ status: 'DELIVERED' });

    const again = await request(server()).put(`/api/v1/tracking/${codeA}/entrega`).set('Authorization', `Bearer ${sergioToken}`).send({}).expect(422);
    expect(again.body.code).toBe('SHIPMENT_INVALID_TRANSITION');
  });

  it('GET /api/v1/historico is admin-only with a required time window', async () => {
    const windowed = await request(server()).get('/api/v1/historico?inicio=2020-01-01T00:00:00.000Z&fim=2030-01-01T00:00:00.000Z').set('Authorization', `Bearer ${adminToken}`).expect(200);

    expect(windowed.body.meta.total).toBeGreaterThanOrEqual(12);
    expect(windowed.body.data.length).toBeGreaterThan(1);
    expect(new Date(windowed.body.data[0].occurredAt).getTime()).toBeGreaterThanOrEqual(new Date(windowed.body.data[1].occurredAt).getTime());

    const missing = await request(server()).get('/api/v1/historico').set('Authorization', `Bearer ${adminToken}`).expect(422);
    expect(missing.body.code).toBe('SHIPMENT_INVALID');

    const forbidden = await request(server()).get('/api/v1/historico?inicio=2020-01-01T00:00:00.000Z').set('Authorization', `Bearer ${sergioToken}`).expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
  });

  it('POST /api/v1/historico/:codigoCarga records manual admin occurrences', async () => {
    const created = await request(server())
      .post(`/api/v1/historico/${codeA}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ locationText: 'Manual checkpoint', notes: 'Support note', occurredAt: '2026-09-10T10:00:00.000Z' })
      .expect(201);

    expect(created.body).toMatchObject({ status: 'DELIVERED', locationText: 'Manual checkpoint', notes: 'Support note', occurredAt: '2026-09-10T10:00:00.000Z' });

    const detail = await request(server()).get(`/api/v1/tracking/${codeA}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(detail.body.status).toBe('DELIVERED');

    await request(server()).post(`/api/v1/historico/${codeA}`).set('Authorization', `Bearer ${sergioToken}`).send({ locationText: 'X' }).expect(403);
  });

  it('GET /api/v1/tracking validates pagination caps and status values', async () => {
    await request(server()).get('/api/v1/tracking?limit=101').set('Authorization', `Bearer ${adminToken}`).expect(400);

    const invalid = await request(server()).get('/api/v1/tracking?status=LOST').set('Authorization', `Bearer ${adminToken}`).expect(422);
    expect(invalid.body.code).toBe('SHIPMENT_INVALID');
  });

  it('DELETE /api/v1/tracking/:codigoCarga removes own-customer cargos only', async () => {
    await request(server()).post('/api/v1/tracking').set('Authorization', `Bearer ${sergioToken}`).send(createBody(codeD)).expect(201);

    await request(server()).delete(`/api/v1/tracking/${codeD}`).set('Authorization', `Bearer ${taniaToken}`).expect(404);
    await request(server()).delete(`/api/v1/tracking/${codeD}`).set('Authorization', `Bearer ${sergioToken}`).expect(204);

    const gone = await request(server()).get(`/api/v1/tracking/${codeD}`).set('Authorization', `Bearer ${sergioToken}`).expect(404);
    expect(gone.body.code).toBe('SHIPMENT_NOT_FOUND');
  });

  it('DELETE /api/v1/tracking/:codigoCarga removes the delivered cargo and its history', async () => {
    await request(server()).delete(`/api/v1/tracking/${codeA}`).set('Authorization', `Bearer ${sergioToken}`).expect(204);

    await request(server()).get(`/api/v1/tracking/${codeA}`).set('Authorization', `Bearer ${sergioToken}`).expect(404);
    await request(server()).get(`/api/v1/tracking/${codeA}/historico`).set('Authorization', `Bearer ${sergioToken}`).expect(404);
  });
});
