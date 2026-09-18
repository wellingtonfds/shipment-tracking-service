import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('Clientes (e2e)', () => {
  let app: INestApplication<App>;
  const email = `e2e-${Date.now()}@example.com`;
  const adminUser = { email: 'admin@logistica.com', password: 'Senha123!' };
  const operatorUser = { email: 'sergio.nogueira@logistica.com', password: 'Senha123!' };

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
  let operatorToken = '';
  let customerId = 0;

  it('POST /api/v1/auth/login authenticates admin and operator', async () => {
    const admin = await request(server()).post('/api/v1/auth/login').send(adminUser).expect(200);
    adminToken = admin.body.token;

    const operator = await request(server()).post('/api/v1/auth/login').send(operatorUser).expect(200);
    operatorToken = operator.body.token;
  });

  it('GET /api/v1/clientes without token is rejected (401)', async () => {
    await request(server()).get('/api/v1/clientes').expect(401);
  });

  it('POST /api/v1/clientes with operator token is forbidden (403)', async () => {
    const response = await request(server())
      .post('/api/v1/clientes')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ name: 'E2E Customer', email, phone: '(11) 90000-0000', address: 'Test Street, 1' })
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('GET /api/v1/clientes with operator token is forbidden (403)', async () => {
    await request(server()).get('/api/v1/clientes').set('Authorization', `Bearer ${operatorToken}`).expect(403);
  });

  it('POST /api/v1/clientes creates customer (201, admin only)', async () => {
    const response = await request(server())
      .post('/api/v1/clientes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Customer', email, phone: '(11) 90000-0000', address: 'Test Street, 1' })
      .expect(201);

    expect(response.body).toMatchObject({
      id: expect.any(Number),
      name: 'E2E Customer',
      email,
      phone: '(11) 90000-0000',
      address: 'Test Street, 1',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    customerId = response.body.id;
  });

  it('POST /api/v1/clientes rejects duplicate email (409)', async () => {
    const response = await request(server())
      .post('/api/v1/clientes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Duplicate', email, phone: '(11) 90000-0001', address: 'Test Street, 2' })
      .expect(409);

    expect(response.body.code).toBe('CUSTOMER_EMAIL_IN_USE');
  });

  it('POST /api/v1/clientes rejects invalid body (400)', async () => {
    await request(server())
      .post('/api/v1/clientes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X', email: 'invalid', phone: '1', address: '' })
      .expect(400);
  });

  it('GET /api/v1/clientes lists paginated (200, admin only)', async () => {
    const response = await request(server())
      .get('/api/v1/clientes?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.meta).toMatchObject({ total: expect.any(Number), page: 1, limit: 10, totalPages: expect.any(Number) });
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeLessThanOrEqual(10);
    for (const customer of response.body.data) {
      expect(customer).toMatchObject({ id: expect.any(Number), name: expect.any(String), email: expect.any(String) });
    }
  });

  it('GET /api/v1/clientes/:id returns details (200, admin only)', async () => {
    const response = await request(server())
      .get(`/api/v1/clientes/${customerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({ id: customerId, email });
  });

  it('GET /api/v1/clientes/:id returns 404 for missing id', async () => {
    const response = await request(server())
      .get('/api/v1/clientes/999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(response.body.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('PUT /api/v1/clientes/:id updates partially (200, admin only)', async () => {
    const response = await request(server())
      .put(`/api/v1/clientes/${customerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: '(11) 91111-1111' })
      .expect(200);

    expect(response.body).toMatchObject({ id: customerId, email, phone: '(11) 91111-1111' });
  });

  it('PUT /api/v1/clientes/:id returns 404 for missing id', async () => {
    await request(server())
      .put('/api/v1/clientes/999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Nobody' })
      .expect(404);
  });

  it('DELETE /api/v1/clientes/:id removes customer (204, admin only)', async () => {
    await request(server()).delete(`/api/v1/clientes/${customerId}`).set('Authorization', `Bearer ${adminToken}`).expect(204);

    await request(server()).get(`/api/v1/clientes/${customerId}`).set('Authorization', `Bearer ${adminToken}`).expect(404);
  });

  it('DELETE /api/v1/clientes/:id returns 404 for missing id', async () => {
    await request(server()).delete('/api/v1/clientes/999999').set('Authorization', `Bearer ${adminToken}`).expect(404);
  });
});
