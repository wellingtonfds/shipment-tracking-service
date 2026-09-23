import { describe, expect, it, vi } from 'vitest';
import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TokenServicePort } from '../../../../application/users/ports/token-service.port.js';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';

function context(authorization?: unknown, user?: unknown) {
  const request = { headers: { authorization }, user };
  const execution = {
    getHandler: () => vi.fn(),
    getClass: () => class Example {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { execution, request };
}

function auth(isPublic = false) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(isPublic) };
  const tokens = {
    verify: vi
      .fn()
      .mockReturnValue({ userId: 7, role: 'OPERATOR', customerId: 3 }),
  };
  return {
    guard: new AuthGuard(
      reflector as unknown as Reflector,
      tokens as unknown as TokenServicePort,
    ),
    reflector,
    tokens,
  };
}

describe('AuthGuard', () => {
  it('allows public routes without checking a token', () => {
    const { guard, tokens } = auth(true);
    expect(guard.canActivate(context().execution)).toBe(true);
    expect(tokens.verify).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Basic secret', 'Bearer ', 3])(
    'rejects an absent or malformed bearer token',
    (header) => {
      const { guard, tokens } = auth();
      expect(() => guard.canActivate(context(header).execution)).toThrow(
        UnauthorizedException,
      );
      expect(tokens.verify).not.toHaveBeenCalled();
    },
  );

  it('verifies the bearer token and attaches the principal', () => {
    const { guard, tokens } = auth();
    const { execution, request } = context('Bearer signed-token');
    expect(guard.canActivate(execution)).toBe(true);
    expect(tokens.verify).toHaveBeenCalledWith('signed-token');
    expect(request.user).toMatchObject({ userId: 7, customerId: 3 });
  });
});

describe('RolesGuard', () => {
  it('allows routes without a role requirement', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    expect(
      new RolesGuard(reflector as unknown as Reflector).canActivate(
        context().execution,
      ),
    ).toBe(true);
  });

  it('allows a matching role and rejects missing or disallowed users', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['ADMINISTRATOR']),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(
      guard.canActivate(
        context(undefined, { role: 'ADMINISTRATOR' }).execution,
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(context(undefined, { role: 'CUSTOMER' }).execution),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context().execution)).toThrow(
      ForbiddenException,
    );
  });
});
