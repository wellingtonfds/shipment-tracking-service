import { User } from '../../../domain/users/user.entity.js';
import { UserNotFoundError } from '../../../domain/users/errors/user-not-found.error.js';
import { UserRepositoryPort } from '../../../domain/users/ports/user-repository.port.js';

export class DeleteUserUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(id: number): Promise<User> {
    const current = await this.repository.findById(id);
    if (!current) {
      throw new UserNotFoundError(id);
    }
    return this.repository.softDelete(id);
  }
}
