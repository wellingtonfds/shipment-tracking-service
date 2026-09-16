import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { CheckHealthUseCase } from '../../../application/health/use-cases/check-health.use-case.js';
import { CHECK_HEALTH_USE_CASE, HEALTH_CHECK_PORT } from '../../../application/health/health.tokens.js';
import { PrismaHealthCheckAdapter } from '../../database/health/prisma-health-check.adapter.js';

@Module({
  controllers: [HealthController],
  providers: [
    { provide: HEALTH_CHECK_PORT, useClass: PrismaHealthCheckAdapter },
    {
      provide: CHECK_HEALTH_USE_CASE,
      useFactory: (healthCheck) => new CheckHealthUseCase(healthCheck),
      inject: [HEALTH_CHECK_PORT],
    },
  ],
})
export class HealthModule {}
