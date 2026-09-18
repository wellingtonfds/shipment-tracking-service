import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthPayload } from '../../../../application/users/ports/token-service.port.js';
import { ROLES_KEY } from './roles.decorator.js';

/**
 * Global authorization guard: enforces the roles declared with @Roles().
 * Routes without @Roles() only require authentication (AuthGuard).
 * Runs after AuthGuard (registration order in HttpModule).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest().user as AuthPayload | undefined;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Access denied for this resource' });
    }
    return true;
  }
}
