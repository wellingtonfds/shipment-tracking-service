import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Restricts the route to one or more user roles (evaluated by the global RolesGuard). */
export const Roles = (...roles: string[]): ReturnType<typeof SetMetadata> => SetMetadata(ROLES_KEY, roles);
