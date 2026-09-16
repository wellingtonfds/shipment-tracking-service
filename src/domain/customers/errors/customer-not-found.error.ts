import { DomainError } from '../../shared/errors/domain.error.js';

export class CustomerNotFoundError extends DomainError {
  constructor(id: number) {
    super('CUSTOMER_NOT_FOUND', `Customer ${id} not found`);
  }
}
