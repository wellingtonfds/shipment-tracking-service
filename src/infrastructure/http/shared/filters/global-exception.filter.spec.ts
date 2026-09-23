import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HttpException,
  Logger,
  UnauthorizedException,
  type ArgumentsHost,
} from '@nestjs/common';
import { DomainError } from '../../../../domain/shared/errors/domain.error.js';
import { GlobalExceptionFilter } from './global-exception.filter.js';

class ExampleDomainError extends DomainError {
  constructor(code: string) {
    super(code, 'Example failure');
  }
}

function invoke(error: unknown) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/v1/example' }),
    }),
  } as unknown as ArgumentsHost;
  new GlobalExceptionFilter().catch(error, host);
  return { status, body: json.mock.calls[0][0] as Record<string, unknown> };
}

describe('GlobalExceptionFilter', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['CUSTOMER_NOT_FOUND', 404],
    ['IDEMPOTENCY_KEY_CONFLICT', 409],
    ['SHIPMENT_INVALID', 422],
    ['UNMAPPED_ERROR', 422],
  ])('maps domain code %s to HTTP %i', (code, expectedStatus) => {
    const { status, body } = invoke(new ExampleDomainError(code));
    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(body).toMatchObject({
      statusCode: expectedStatus,
      code,
      message: 'Example failure',
      path: '/api/v1/example',
    });
    expect(new Date(body.timestamp as string).toISOString()).toBe(
      body.timestamp,
    );
  });

  it('preserves structured HTTP exception codes and messages', () => {
    const { body } = invoke(
      new UnauthorizedException({
        code: 'TOKEN_MISSING',
        message: 'Missing bearer token',
      }),
    );
    expect(body).toMatchObject({
      statusCode: 401,
      code: 'TOKEN_MISSING',
      message: 'Missing bearer token',
    });
  });

  it('falls back to the HTTP exception name and message', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const { body } = invoke(new HttpException('Unavailable', 503));
    expect(body).toMatchObject({
      statusCode: 503,
      code: 'HttpException',
      message: 'Unavailable',
    });
    expect(log).toHaveBeenCalledWith('Unavailable', expect.any(String));
  });

  it('hides unknown exception details', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const { status, body } = invoke(new Error('database credentials leaked'));
    expect(status).toHaveBeenCalledWith(500);
    expect(body).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(log).toHaveBeenCalledWith(
      'Internal server error',
      expect.stringContaining('database credentials leaked'),
    );
  });
});
