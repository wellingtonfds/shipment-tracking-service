import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bullBoardDevelopmentAccess } from './http.module.js';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

function invokeMiddleware(remoteAddress: string) {
  const request = { socket: { remoteAddress } } as Request;
  const sendStatus = vi.fn();
  const response = { sendStatus } as unknown as Response;
  const next = vi.fn() as NextFunction;

  bullBoardDevelopmentAccess(request, response, next);

  return { sendStatus, next };
}

describe('bullBoardDevelopmentAccess', () => {
  it('allows loopback connections in development', () => {
    process.env.NODE_ENV = 'development';

    const { sendStatus, next } = invokeMiddleware('::ffff:127.0.0.1');

    expect(next).toHaveBeenCalledOnce();
    expect(sendStatus).not.toHaveBeenCalled();
  });

  it('rejects remote connections in development', () => {
    process.env.NODE_ENV = 'development';

    const { sendStatus, next } = invokeMiddleware('10.0.0.4');

    expect(sendStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('hides the dashboard outside development', () => {
    process.env.NODE_ENV = 'production';

    const { sendStatus, next } = invokeMiddleware('127.0.0.1');

    expect(sendStatus).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
});
