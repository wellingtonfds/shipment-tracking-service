import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { StdSerializedResults } from 'pino-http';
import { activeTraceFields } from './telemetry.js';

const service = process.env.OTEL_SERVICE_NAME ?? 'shipment-tracking-service';
const environment = process.env.NODE_ENV ?? 'development';
type RawRequestWithId = Request & { id: string };
type SerializedRequest = StdSerializedResults['req'];

export const loggingOptions = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service, environment },
    genReqId: (request: RawRequestWithId) => {
      const header = request.headers['x-request-id'];
      return typeof header === 'string' && header.length <= 128
        ? header
        : randomUUID();
    },
    customProps: (request: RawRequestWithId) => ({
      requestId: request.id,
      component: 'http',
      ...activeTraceFields(),
    }),
    mixin: () => activeTraceFields(),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-api-key',
        'req.headers.x-forwarded-client-cert',
        'authorization',
        'token',
        'accessToken',
        'refreshToken',
        'password',
        'apiKey',
        'secret',
        '*.authorization',
        '*.token',
        '*.password',
        '*.apiKey',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      req: (request: SerializedRequest) => ({
        id: request.id,
        method: request.method,
        url: request.url,
        remoteAddress: request.remoteAddress,
      }),
    },
  },
};

@Module({
  imports: [LoggerModule.forRoot(loggingOptions)],
})
export class LoggingModule {}
