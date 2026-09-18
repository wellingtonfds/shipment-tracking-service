import { User } from '../../../domain/users/user.entity.js';
import { UserNotFoundError } from '../../../domain/users/errors/user-not-found.error.js';
import { UserRepositoryPort } from '../../../domain/users/ports/user-repository.port.js';

export class GetUserUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(id: number): Promise<User> {
    const user = await this.repository.findById(id);
    if (!user) {
      throw new UserNotFoundError(id);
    }
    return user;
  }
}
