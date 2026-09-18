import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('Operadores (e2e)', () => {
  let app: INestApplication<App>;
  const stamp = Date.now();
  const operatorEmail = `e2e-op-${stamp}@example.com`;
  const adminUser = { email: 'admin@logistica.com', password: 'Senha123!' };

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
  let operatorId = 0;

  it('POST /api/v1/auth/login rejects wrong credentials (401)', async () => {
    const response = await request(server()).post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: 'WrongPass9' }).expect(401);

    expect(response.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /api/v1/auth/login authenticates the seeded admin (200)', async () => {
    const response = await request(server()).post('/api/v1/auth/login').send(adminUser).expect(200);

    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body).not.toHaveProperty('user');
    adminToken = response.body.token;
  });

  it('GET /api/v1/operadores without token is rejected (401)', async () => {
    const response = await request(server()).get('/api/v1/operadores').expect(401);

    expect(response.body.code).toBe('TOKEN_MISSING');
  });

  it('POST /api/v1/operadores creates an operator (201, admin only)', async () => {
    const response = await request(server())
      .post('/api/v1/operadores')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Operator', email: operatorEmail, password: 'Senha123!', role: 'OPERATOR' })
      .expect(201);

    expect(response.body).toMatchObject({ name: 'E2E Operator', email: operatorEmail, role: 'OPERATOR', active: true, customerId: null });
    expect(response.body).not.toHaveProperty('passwordHash');
    operatorId = response.body.id;
  });

  it('POST /api/v1/operadores rejects duplicate email (409)', async () => {
    const response = await request(server())
      .post('/api/v1/operadores')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Duplicate', email: operatorEmail, password: 'Senha123!', role: 'OPERATOR' })
      .expect(409);

    expect(response.body.code).toBe('USER_EMAIL_IN_USE');
  });

  it('POST /api/v1/operadores rejects CUSTOMER without customer link (422)', async () => {
    const response = await request(server())
      .post('/api/v1/operadores')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Portal', email: `e2e-portal-${stamp}@example.com`, password: 'Senha123!', role: 'CUSTOMER' })
      .expect(422);

    expect(response.body.code).toBe('USER_CUSTOMER_LINK_INVALID');
  });

  it('GET /api/v1/operadores/:id returns operator details (200, admin only)', async () => {
    const response = await request(server()).get(`/api/v1/operadores/${operatorId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);

    expect(response.body).toMatchObject({ id: operatorId, email: operatorEmail });
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('GET /api/v1/operadores/:id returns 404 for missing id', async () => {
    const response = await request(server()).get('/api/v1/operadores/999999').set('Authorization', `Bearer ${adminToken}`).expect(404);

    expect(response.body.code).toBe('USER_NOT_FOUND');
  });

  it('operator token is rejected on admin routes (403) but works on /me (200)', async () => {
    const login = await request(server()).post('/api/v1/auth/login').send({ email: operatorEmail, password: 'Senha123!' }).expect(200);
    operatorToken = login.body.token;

    const forbidden = await request(server()).get(`/api/v1/operadores/${operatorId}`).set('Authorization', `Bearer ${operatorToken}`).expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const me = await request(server()).get('/api/v1/operadores/me').set('Authorization', `Bearer ${operatorToken}`).expect(200);
    expect(me.body).toMatchObject({ id: operatorId, email: operatorEmail });
    expect(me.body).not.toHaveProperty('passwordHash');
  });

  it('GET /api/v1/operadores supports filters and pagination (200)', async () => {
    const response = await request(server())
      .get('/api/v1/operadores?page=1&limit=10&role=OPERATOR&active=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.meta).toMatchObject({ total: expect.any(Number), page: 1, limit: 10, totalPages: expect.any(Number) });
    expect(Array.isArray(response.body.data)).toBe(true);
    for (const user of response.body.data) {
      expect(user).toMatchObject({ role: 'OPERATOR', active: true });
      expect(user).not.toHaveProperty('passwordHash');
    }
  });

  it('PUT /api/v1/operadores/me updates own profile (200)', async () => {
    const response = await request(server())
      .put('/api/v1/operadores/me')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ name: 'E2E Operator Updated' })
      .expect(200);

    expect(response.body).toMatchObject({ id: operatorId, name: 'E2E Operator Updated', role: 'OPERATOR' });
  });

  it('PUT /api/v1/operadores/me ignores privilege escalation fields', async () => {
    const response = await request(server())
      .put('/api/v1/operadores/me')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ name: 'E2E Operator Updated', role: 'ADMINISTRATOR', active: false })
      .expect(400);

    expect(response.body.statusCode).toBe(400);
  });

  it('PUT /api/v1/operadores/:id updates partially (200, admin only)', async () => {
    const response = await request(server())
      .put(`/api/v1/operadores/${operatorId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Operator Renamed' })
      .expect(200);

    expect(response.body).toMatchObject({ id: operatorId, name: 'E2E Operator Renamed' });
  });

  it('changed password works on next login (200)', async () => {
    await request(server()).put('/api/v1/operadores/me').set('Authorization', `Bearer ${operatorToken}`).send({ password: 'NovaSenha123!' }).expect(200);

    await request(server()).post('/api/v1/auth/login').send({ email: operatorEmail, password: 'Senha123!' }).expect(401);

    const relogin = await request(server()).post('/api/v1/auth/login').send({ email: operatorEmail, password: 'NovaSenha123!' }).expect(200);
    operatorToken = relogin.body.token;
  });

  it('DELETE /api/v1/operadores/:id deactivates instead of removing (204)', async () => {
    await request(server()).delete(`/api/v1/operadores/${operatorId}`).set('Authorization', `Bearer ${adminToken}`).expect(204);

    const after = await request(server()).get(`/api/v1/operadores/${operatorId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(after.body.active).toBe(false);

    const login = await request(server()).post('/api/v1/auth/login').send({ email: operatorEmail, password: 'NovaSenha123!' }).expect(401);
    expect(login.body.code).toBe('INVALID_CREDENTIALS');
  });
});
