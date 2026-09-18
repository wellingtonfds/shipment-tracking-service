import { Injectable } from '@nestjs/common';
import type { BinaryLike, ScryptOptions } from 'node:crypto';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PasswordHasherPort } from '../../application/users/ports/password-hasher.port.js';

type ScryptAsync = (password: BinaryLike, salt: BinaryLike, keylen: number, options: ScryptOptions) => Promise<Buffer>;

const scryptAsync = promisify(scryptCallback) as ScryptAsync;

const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, keyLength: 64 } as const;

@Injectable()
export class ScryptPasswordHasher implements PasswordHasherPort {
  async hash(plaintext: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derived = (await scryptAsync(plaintext, salt, SCRYPT_OPTIONS.keyLength, {
      N: SCRYPT_OPTIONS.N,
      r: SCRYPT_OPTIONS.r,
      p: SCRYPT_OPTIONS.p,
      maxmem: 64 * 1024 * 1024,
    })) as Buffer;
    return ['scrypt', SCRYPT_OPTIONS.N, SCRYPT_OPTIONS.r, SCRYPT_OPTIONS.p, salt, derived.toString('hex')].join('$');
  }

  async compare(plaintext: string, passwordHash: string): Promise<boolean> {
    try {
      const [scheme, n, r, p, salt, expected] = passwordHash.split('$');
      if (scheme !== 'scrypt' || !n || !r || !p || !salt || !expected) {
        return false;
      }
      const derived = (await scryptAsync(plaintext, salt, Buffer.from(expected, 'hex').length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
        maxmem: 64 * 1024 * 1024,
      })) as Buffer;
      const expectedBuffer = Buffer.from(expected, 'hex');
      return derived.length === expectedBuffer.length && timingSafeEqual(derived, expectedBuffer);
    } catch {
      return false;
    }
  }
}
