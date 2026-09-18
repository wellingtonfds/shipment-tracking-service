import { DomainError } from '../../shared/errors/domain.error.js';

export class CustomerScopeMissingError extends DomainError {
  constructor(message = 'Authenticated principal is not linked to a customer') {
    super('CUSTOMER_SCOPE_MISSING', message);
  }
}
