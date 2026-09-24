import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loggingOptions } from './logging.module.js';

describe('loggingOptions', () => {
  it('writes structured JSON and redacts secrets', () => {
    const records: string[] = [];
    const logger = pino(loggingOptions.pinoHttp, {
      write: (record: string) => records.push(record),
    });

    logger.info(
      {
        component: 'tracking-worker',
        event: 'tracking.dispatch.completed',
        token: 'private-token',
        nested: { password: 'private-password' },
      },
      'Tracking event dispatched',
    );

    const record = JSON.parse(records[0]) as Record<string, unknown>;
    expect(record).toMatchObject({
      service: expect.any(String),
      environment: expect.any(String),
      component: 'tracking-worker',
      event: 'tracking.dispatch.completed',
      token: '[REDACTED]',
      nested: { password: '[REDACTED]' },
    });
  });

  it('propagates a bounded request ID and serializes no headers', () => {
    const options = loggingOptions.pinoHttp;
    const request = {
      id: 'request-123',
      headers: { 'x-request-id': 'request-123', authorization: 'secret' },
      method: 'GET',
      url: '/api/v1/health',
      socket: { remoteAddress: '127.0.0.1' },
    };

    expect(options.genReqId(request as never)).toBe('request-123');
    expect(options.customProps(request as never)).toMatchObject({
      requestId: 'request-123',
      component: 'http',
    });
    expect(options.serializers.req(request as never)).toEqual({
      id: 'request-123',
      method: 'GET',
      url: '/api/v1/health',
      remoteAddress: '127.0.0.1',
    });
  });
});
