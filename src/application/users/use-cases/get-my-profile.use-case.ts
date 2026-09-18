import { User } from '../../../domain/users/user.entity.js';
import { UserNotFoundError } from '../../../domain/users/errors/user-not-found.error.js';
import { AccessDeniedError } from '../../../domain/users/errors/access-denied.error.js';
import { UserRepositoryPort } from '../../../domain/users/ports/user-repository.port.js';

export class GetMyProfileUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(userId: number): Promise<User> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }
    if (!user.active) {
      throw new AccessDeniedError('Inactive users cannot access their profile');
    }
    return user;
  }
}
