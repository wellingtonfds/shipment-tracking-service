import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthPayload } from '../../../../application/users/ports/token-service.port.js';

/** Extracts the authenticated principal attached by AuthGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthPayload => {
  return ctx.switchToHttp().getRequest().user as AuthPayload;
});
