import { DomainError } from './domain.error.js';

export class ClienteEmailInUseError extends DomainError {
  constructor(email: string) {
    super('CLIENTE_EMAIL_IN_USE', `Email ${email} já está em uso`);
  }
}
