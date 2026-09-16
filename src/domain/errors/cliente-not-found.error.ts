import { DomainError } from './domain.error.js';

export class ClienteNotFoundError extends DomainError {
  constructor(id: number) {
    super('CLIENTE_NOT_FOUND', `Cliente ${id} não encontrado`);
  }
}
