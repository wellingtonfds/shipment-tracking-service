import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter.js';
import { HealthModule } from './health/health.module.js';
import { CustomersModule } from './customers/customers.module.js';

@Module({
  imports: [HealthModule, CustomersModule],
  providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
})
export class HttpModule {}
