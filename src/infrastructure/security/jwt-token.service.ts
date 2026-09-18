import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthPayload, TokenServicePort } from '../../application/users/ports/token-service.port.js';

interface JwtPayload {
  sub: number;
  role: string;
  customerId: number | null;
}

@Injectable()
export class JwtTokenService implements TokenServicePort {
  constructor(private readonly jwtService: JwtService) {}

  async sign(payload: AuthPayload): Promise<string> {
    return this.jwtService.signAsync({ sub: payload.userId, role: payload.role, customerId: payload.customerId });
  }

  verify(token: string): AuthPayload {
    try {
      const decoded = this.jwtService.verify<JwtPayload>(token);
      if (typeof decoded.sub !== 'number' || typeof decoded.role !== 'string') {
        throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid token payload' });
      }
      return { userId: decoded.sub, role: decoded.role, customerId: decoded.customerId ?? null };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid or expired token' });
    }
  }
}
