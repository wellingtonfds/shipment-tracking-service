import { Shipment, TenantPrincipal, InvalidShipmentError, applyTenantScope, assertCargoCode } from '../../../domain/shipments/shipment.entity.js';
import { ShipmentNotFoundError } from '../../../domain/shipments/errors/shipment-not-found.error.js';
import { ShipmentConflictError } from '../../../domain/shipments/errors/shipment-conflict.error.js';
import { ShipmentRepositoryPort } from '../../../domain/shipments/ports/shipment-repository.port.js';

/** Loads a shipment by natural key and enforces the tenant scope from the token. */
export async function loadScopedShipment(repository: ShipmentRepositoryPort, cargoCode: string, principal: TenantPrincipal): Promise<Shipment> {
  const code = assertCargoCode(cargoCode);
  const shipment = await repository.findByCargoCode(code);
  if (!shipment) {
    throw new ShipmentNotFoundError(code);
  }
  const scope = applyTenantScope(principal);
  if (scope !== null && shipment.customerId !== scope) {
    // Same 404 as a missing shipment: never leak other customers' data.
    throw new ShipmentNotFoundError(code);
  }
  return shipment;
}

export function assertPage(page: number | undefined): number {
  const value = page ?? 1;
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidShipmentError('page must be an integer starting at 1');
  }
  return value;
}

export function assertLimit(limit: number | undefined, fallback: number, max: number): number {
  const value = limit ?? fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidShipmentError('limit must be a positive integer');
  }
  if (value > max) {
    throw new InvalidShipmentError(`limit must be at most ${max}`);
  }
  return value;
}

export function paginate<T>(data: T[], total: number, page: number, limit: number): { data: T[]; total: number; page: number; limit: number; totalPages: number } {
  return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/**
 * Bounded optimistic retry: on ShipmentConflictError, revalidates the transition
 * against the persisted status carried by the error and retries the attempt.
 */
export async function retryOptimisticUpdate<T>(attempt: (current: Shipment) => Promise<T>, current: Shipment, revalidate: (current: Shipment) => void, maxAttempts = 3): Promise<T> {
  let latest = current;
  for (let n = 1; ; n += 1) {
    try {
      return await attempt(latest);
    } catch (error) {
      if (!(error instanceof ShipmentConflictError) || n >= maxAttempts) {
        throw error;
      }
      latest = error.current;
      revalidate(latest);
    }
  }
}
