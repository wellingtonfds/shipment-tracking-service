import { DomainError } from '../../shared/errors/domain.error.js';

export class IdempotencyKeyConflictError extends DomainError {
  constructor() {
    super('IDEMPOTENCY_KEY_CONFLICT', 'Idempotency-Key was already used with a different request payload');
  }
}
