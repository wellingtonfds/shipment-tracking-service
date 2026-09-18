import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a controller or route as public (bypasses the global AuthGuard).
 * Used on login, health and legacy endpoints. Never on /operadores routes.
 */
export const Public = (): ReturnType<typeof SetMetadata> => SetMetadata(IS_PUBLIC_KEY, true);
