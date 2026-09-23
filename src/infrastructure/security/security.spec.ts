import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenService } from './jwt-token.service.js';
import { ScryptPasswordHasher } from './scrypt-password-hasher.js';

describe('JwtTokenService', () => {
  it('signs the principal and verifies a valid payload', async () => {
    const jwt = {
      signAsync: vi.fn().mockResolvedValue('signed'),
      verify: vi
        .fn()
        .mockReturnValue({ sub: 7, role: 'OPERATOR', customerId: 3 }),
    };
    const service = new JwtTokenService(jwt as unknown as JwtService);
    const principal = { userId: 7, role: 'OPERATOR', customerId: 3 };

    await expect(service.sign(principal)).resolves.toBe('signed');
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 7,
      role: 'OPERATOR',
      customerId: 3,
    });
    expect(service.verify('signed')).toEqual(principal);
  });

  it('rejects missing claims and expired tokens without leaking the original error', () => {
    const jwt = {
      verify: vi.fn().mockReturnValue({ sub: '7', role: 'OPERATOR' }),
    };
    const service = new JwtTokenService(jwt as unknown as JwtService);
    expect(() => service.verify('bad')).toThrow(UnauthorizedException);
    jwt.verify.mockImplementation(() => {
      throw new Error('secret');
    });
    expect(() => service.verify('expired')).toThrow('Invalid or expired token');
  });
});

describe('ScryptPasswordHasher', () => {
  it('verifies the correct password and rejects another password', async () => {
    const hasher = new ScryptPasswordHasher();
    const digest = await hasher.hash('correct');
    expect(digest).toMatch(/^scrypt\$16384\$8\$1\$/);
    await expect(hasher.compare('correct', digest)).resolves.toBe(true);
    await expect(hasher.compare('wrong', digest)).resolves.toBe(false);
  });

  it('rejects malformed stored hashes', async () => {
    const hasher = new ScryptPasswordHasher();
    await expect(hasher.compare('password', 'plain-text')).resolves.toBe(false);
    await expect(
      hasher.compare('password', 'scrypt$invalid$8$1$salt$ff'),
    ).resolves.toBe(false);
  });
});
