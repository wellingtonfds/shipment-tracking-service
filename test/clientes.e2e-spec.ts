import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('Clientes (e2e)', () => {
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

  let clienteId = 0;

  it('POST /api/v1/clientes cria cliente (201)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/clientes')
      .send({ nome: 'Cliente E2E', email, telefone: '(11) 90000-0000', endereco: 'Rua de Teste, 1' })
      .expect(201);

    expect(response.body).toMatchObject({
      id: expect.any(Number),
      nome: 'Cliente E2E',
      email,
      telefone: '(11) 90000-0000',
      endereco: 'Rua de Teste, 1',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    clienteId = response.body.id;
  });

  it('POST /api/v1/clientes rejeita email duplicado (409)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/clientes')
      .send({ nome: 'Duplicado', email, telefone: '(11) 90000-0001', endereco: 'Rua de Teste, 2' })
      .expect(409);

    expect(response.body.code).toBe('CLIENTE_EMAIL_IN_USE');
  });

  it('POST /api/v1/clientes rejeita body inválido (400)', async () => {
    await request(app.getHttpServer()).post('/api/v1/clientes').send({ nome: 'X', email: 'invalido', telefone: '1', endereco: '' }).expect(400);
  });

  it('GET /api/v1/clientes lista paginado (200)', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/clientes?page=1&limit=10').expect(200);

    expect(response.body.meta).toMatchObject({ total: expect.any(Number), page: 1, limit: 10, totalPages: expect.any(Number) });
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeLessThanOrEqual(10);
    for (const cliente of response.body.data) {
      expect(cliente).toMatchObject({ id: expect.any(Number), nome: expect.any(String), email: expect.any(String) });
    }
  });

  it('GET /api/v1/clientes/:id retorna detalhes (200)', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/clientes/${clienteId}`).expect(200);

    expect(response.body).toMatchObject({ id: clienteId, email });
  });

  it('GET /api/v1/clientes/:id retorna 404 para id inexistente', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/clientes/999999').expect(404);

    expect(response.body.code).toBe('CLIENTE_NOT_FOUND');
  });

  it('PUT /api/v1/clientes/:id atualiza parcialmente (200)', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/clientes/${clienteId}`)
      .send({ telefone: '(11) 91111-1111' })
      .expect(200);

    expect(response.body).toMatchObject({ id: clienteId, email, telefone: '(11) 91111-1111' });
  });

  it('PUT /api/v1/clientes/:id retorna 404 para id inexistente', async () => {
    await request(app.getHttpServer()).put('/api/v1/clientes/999999').send({ nome: 'Ninguém' }).expect(404);
  });

  it('DELETE /api/v1/clientes/:id remove cliente (204)', async () => {
    await request(app.getHttpServer()).delete(`/api/v1/clientes/${clienteId}`).expect(204);

    await request(app.getHttpServer()).get(`/api/v1/clientes/${clienteId}`).expect(404);
  });

  it('DELETE /api/v1/clientes/:id retorna 404 para id inexistente', async () => {
    await request(app.getHttpServer()).delete('/api/v1/clientes/999999').expect(404);
  });
});
