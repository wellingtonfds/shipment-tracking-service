import { DomainError } from '../../shared/errors/domain.error.js';

export class UserNotFoundError extends DomainError {
  constructor(id: number) {
    super('USER_NOT_FOUND', `User ${id} not found`);
  }
}
