import { User, UpdateUserInput, validateUserUpdate } from '../../../domain/users/user.entity.js';
import { UserNotFoundError } from '../../../domain/users/errors/user-not-found.error.js';
import { UserEmailInUseError } from '../../../domain/users/errors/user-email-in-use.error.js';
import { UpdateUserData, UserRepositoryPort } from '../../../domain/users/ports/user-repository.port.js';
import { PasswordHasherPort } from '../ports/password-hasher.port.js';

export class UpdateUserUseCase {
  constructor(
    private readonly repository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async execute(id: number, input: UpdateUserInput): Promise<User> {
    const current = await this.repository.findById(id);
    if (!current) {
      throw new UserNotFoundError(id);
    }

    const update = validateUserUpdate(current, input);

    if (update.email !== undefined && update.email !== current.email) {
      const existing = await this.repository.findByEmail(update.email);
      if (existing && existing.id !== id) {
        throw new UserEmailInUseError(update.email);
      }
    }

    const data: UpdateUserData = {
      ...(update.name !== undefined ? { name: update.name } : {}),
      ...(update.email !== undefined ? { email: update.email } : {}),
      ...(update.role !== undefined ? { role: update.role } : {}),
      ...(update.active !== undefined ? { active: update.active } : {}),
      ...('customerId' in update ? { customerId: update.customerId } : {}),
      ...(update.password !== undefined ? { passwordHash: await this.passwordHasher.hash(update.password) } : {}),
    };

    return this.repository.update(id, data);
  }
}
