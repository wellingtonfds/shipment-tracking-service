import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import type { NextFunction, Request, Response } from 'express';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter.js';
import { AuthGuard } from './shared/guards/auth.guard.js';
import { RolesGuard } from './shared/guards/roles.guard.js';
import { HealthModule } from './health/health.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { UsersModule } from './users/users.module.js';
import { TrackingModule } from './tracking/tracking.module.js';

export function bullBoardDevelopmentAccess(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (process.env.NODE_ENV !== 'development') {
    response.sendStatus(404);
    return;
  }

  const address = request.socket.remoteAddress;
  if (
    address !== '127.0.0.1' &&
    address !== '::1' &&
    address !== '::ffff:127.0.0.1'
  ) {
    response.sendStatus(403);
    return;
  }

  next();
}

@Module({
  imports: [
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
      middleware: bullBoardDevelopmentAccess,
    }),
    HealthModule,
    CustomersModule,
    UsersModule,
    TrackingModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    // AuthGuard first: attaches the principal; RolesGuard second: enforces @Roles().
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class HttpModule {}
