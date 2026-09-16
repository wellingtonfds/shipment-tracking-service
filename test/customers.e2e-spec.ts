import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('Customers (e2e)', () => {
  let app: INestApplication<App>;
  const email = `e2e-${Date.now()}@example.com`;

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

  let customerId = 0;

  it('POST /api/v1/customers creates customer (201)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/customers')
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

  it('POST /api/v1/customers rejects duplicate email (409)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .send({ name: 'Duplicate', email, phone: '(11) 90000-0001', address: 'Test Street, 2' })
      .expect(409);

    expect(response.body.code).toBe('CUSTOMER_EMAIL_IN_USE');
  });

  it('POST /api/v1/customers rejects invalid body (400)', async () => {
    await request(app.getHttpServer()).post('/api/v1/customers').send({ name: 'X', email: 'invalid', phone: '1', address: '' }).expect(400);
  });

  it('GET /api/v1/customers lists paginated (200)', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/customers?page=1&limit=10').expect(200);

    expect(response.body.meta).toMatchObject({ total: expect.any(Number), page: 1, limit: 10, totalPages: expect.any(Number) });
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeLessThanOrEqual(10);
    for (const customer of response.body.data) {
      expect(customer).toMatchObject({ id: expect.any(Number), name: expect.any(String), email: expect.any(String) });
    }
  });

  it('GET /api/v1/customers/:id returns details (200)', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/customers/${customerId}`).expect(200);

    expect(response.body).toMatchObject({ id: customerId, email });
  });

  it('GET /api/v1/customers/:id returns 404 for missing id', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/customers/999999').expect(404);

    expect(response.body.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('PUT /api/v1/customers/:id updates partially (200)', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/customers/${customerId}`)
      .send({ phone: '(11) 91111-1111' })
      .expect(200);

    expect(response.body).toMatchObject({ id: customerId, email, phone: '(11) 91111-1111' });
  });

  it('PUT /api/v1/customers/:id returns 404 for missing id', async () => {
    await request(app.getHttpServer()).put('/api/v1/customers/999999').send({ name: 'Nobody' }).expect(404);
  });

  it('DELETE /api/v1/customers/:id removes customer (204)', async () => {
    await request(app.getHttpServer()).delete(`/api/v1/customers/${customerId}`).expect(204);

    await request(app.getHttpServer()).get(`/api/v1/customers/${customerId}`).expect(404);
  });

  it('DELETE /api/v1/customers/:id returns 404 for missing id', async () => {
    await request(app.getHttpServer()).delete('/api/v1/customers/999999').expect(404);
  });
});
