import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from './filters/global-exception.filter.js';
import { HealthController } from './controllers/health.controller.js';
import { CheckHealthUseCase } from '../../application/use-cases/check-health.use-case.js';
import { CHECK_HEALTH_USE_CASE, HEALTH_CHECK_PORT } from '../../application/ports/tokens.js';
import { PrismaHealthCheckAdapter } from '../database/prisma-health-check.adapter.js';

@Module({
  controllers: [HealthController],
  providers: [
    { provide: HEALTH_CHECK_PORT, useClass: PrismaHealthCheckAdapter },
    {
      provide: CHECK_HEALTH_USE_CASE,
      useFactory: (healthCheck) => new CheckHealthUseCase(healthCheck),
      inject: [HEALTH_CHECK_PORT],
    },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class HttpModule {}
