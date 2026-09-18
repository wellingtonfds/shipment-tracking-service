import { DomainError } from '../../shared/errors/domain.error.js';

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('INVALID_CREDENTIALS', 'Invalid email or password');
  }
}
