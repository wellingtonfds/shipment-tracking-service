import { DomainError } from '../../shared/errors/domain.error.js';

export class CustomerEmailInUseError extends DomainError {
  constructor(email: string) {
    super('CUSTOMER_EMAIL_IN_USE', `Email ${email} is already in use`);
  }
}
