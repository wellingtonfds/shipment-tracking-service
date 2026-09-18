import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TOKEN_SERVICE } from '../../../../application/users/user.tokens.js';
import type { TokenServicePort } from '../../../../application/users/ports/token-service.port.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * Global authentication guard: validates the Bearer token and attaches
 * the principal { userId, role, customerId } to the request.
 * Skipped on routes decorated with @Public().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenServicePort,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) {
      return true;
    }

    const token = this.extractBearerToken(context);
    if (!token) {
      throw new UnauthorizedException({ code: 'TOKEN_MISSING', message: 'Missing bearer token' });
    }

    const payload = this.tokens.verify(token);
    context.switchToHttp().getRequest().user = payload;
    return true;
  }

  private extractBearerToken(context: ExecutionContext): string | null {
    const request = context.switchToHttp().getRequest();
    const authorization: unknown = request.headers?.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      return null;
    }
    const token = authorization.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
  }
}
