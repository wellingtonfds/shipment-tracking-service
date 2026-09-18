import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter.js';
import { AuthGuard } from './shared/guards/auth.guard.js';
import { RolesGuard } from './shared/guards/roles.guard.js';
import { HealthModule } from './health/health.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [HealthModule, CustomersModule, UsersModule],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    // AuthGuard first: attaches the principal; RolesGuard second: enforces @Roles().
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class HttpModule {}
