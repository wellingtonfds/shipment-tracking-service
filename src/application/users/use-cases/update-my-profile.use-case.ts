import { User, validateUserUpdate } from '../../../domain/users/user.entity.js';
import { UserNotFoundError } from '../../../domain/users/errors/user-not-found.error.js';
import { AccessDeniedError } from '../../../domain/users/errors/access-denied.error.js';
import { UserEmailInUseError } from '../../../domain/users/errors/user-email-in-use.error.js';
import { UpdateUserData, UserRepositoryPort } from '../../../domain/users/ports/user-repository.port.js';
import { PasswordHasherPort } from '../ports/password-hasher.port.js';

export interface UpdateMyProfileInput {
  readonly name?: string;
  readonly email?: string;
  readonly password?: string;
}

export class UpdateMyProfileUseCase {
  constructor(
    private readonly repository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async execute(userId: number, input: UpdateMyProfileInput): Promise<User> {
    const current = await this.repository.findById(userId);
    if (!current) {
      throw new UserNotFoundError(userId);
    }
    if (!current.active) {
      throw new AccessDeniedError('Inactive users cannot update their profile');
    }

    const update = validateUserUpdate(current, { name: input.name, email: input.email, password: input.password });

    if (update.email !== undefined && update.email !== current.email) {
      const existing = await this.repository.findByEmail(update.email);
      if (existing && existing.id !== userId) {
        throw new UserEmailInUseError(update.email);
      }
    }

    const data: UpdateUserData = {
      ...(update.name !== undefined ? { name: update.name } : {}),
      ...(update.email !== undefined ? { email: update.email } : {}),
      ...(update.password !== undefined ? { passwordHash: await this.passwordHasher.hash(update.password) } : {}),
    };

    return this.repository.update(userId, data);
  }
}
