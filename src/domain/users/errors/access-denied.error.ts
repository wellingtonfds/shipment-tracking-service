import { DomainError } from '../../shared/errors/domain.error.js';

export class AccessDeniedError extends DomainError {
  constructor(message = 'Access denied for this resource') {
    super('FORBIDDEN', message);
  }
}
