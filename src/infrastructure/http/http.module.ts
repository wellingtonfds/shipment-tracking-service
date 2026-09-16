import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from './filters/global-exception.filter.js';
import { HealthController } from './controllers/health.controller.js';
import { ClientesController } from './controllers/clientes.controller.js';
import { CheckHealthUseCase } from '../../application/use-cases/check-health.use-case.js';
import { CreateClienteUseCase } from '../../application/use-cases/create-cliente.use-case.js';
import { GetClienteUseCase } from '../../application/use-cases/get-cliente.use-case.js';
import { ListClientesUseCase } from '../../application/use-cases/list-clientes.use-case.js';
import { UpdateClienteUseCase } from '../../application/use-cases/update-cliente.use-case.js';
import { DeleteClienteUseCase } from '../../application/use-cases/delete-cliente.use-case.js';
import { CHECK_HEALTH_USE_CASE, CLIENTE_REPOSITORY, CREATE_CLIENTE_USE_CASE, DELETE_CLIENTE_USE_CASE, GET_CLIENTE_USE_CASE, HEALTH_CHECK_PORT, LIST_CLIENTES_USE_CASE, UPDATE_CLIENTE_USE_CASE } from '../../application/ports/tokens.js';
import { PrismaHealthCheckAdapter } from '../database/prisma-health-check.adapter.js';
import { PrismaClienteRepositoryAdapter } from '../database/prisma-cliente-repository.adapter.js';

@Module({
  controllers: [HealthController, ClientesController],
  providers: [
    { provide: HEALTH_CHECK_PORT, useClass: PrismaHealthCheckAdapter },
    { provide: CLIENTE_REPOSITORY, useClass: PrismaClienteRepositoryAdapter },
    {
      provide: CHECK_HEALTH_USE_CASE,
      useFactory: (healthCheck) => new CheckHealthUseCase(healthCheck),
      inject: [HEALTH_CHECK_PORT],
    },
    { provide: LIST_CLIENTES_USE_CASE, useFactory: (repo) => new ListClientesUseCase(repo), inject: [CLIENTE_REPOSITORY] },
    { provide: GET_CLIENTE_USE_CASE, useFactory: (repo) => new GetClienteUseCase(repo), inject: [CLIENTE_REPOSITORY] },
    { provide: CREATE_CLIENTE_USE_CASE, useFactory: (repo) => new CreateClienteUseCase(repo), inject: [CLIENTE_REPOSITORY] },
    { provide: UPDATE_CLIENTE_USE_CASE, useFactory: (repo) => new UpdateClienteUseCase(repo), inject: [CLIENTE_REPOSITORY] },
    { provide: DELETE_CLIENTE_USE_CASE, useFactory: (repo) => new DeleteClienteUseCase(repo), inject: [CLIENTE_REPOSITORY] },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class HttpModule {}
