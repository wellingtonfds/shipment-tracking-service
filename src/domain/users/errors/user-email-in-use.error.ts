import { DomainError } from '../../shared/errors/domain.error.js';

export class UserEmailInUseError extends DomainError {
  constructor(email: string) {
    super('USER_EMAIL_IN_USE', `Email ${email} is already registered`);
  }
}
