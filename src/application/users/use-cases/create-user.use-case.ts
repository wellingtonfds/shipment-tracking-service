import { User, CreateUserInput, validateUser } from '../../../domain/users/user.entity.js';
import { UserEmailInUseError } from '../../../domain/users/errors/user-email-in-use.error.js';
import { UserRepositoryPort } from '../../../domain/users/ports/user-repository.port.js';
import { PasswordHasherPort } from '../ports/password-hasher.port.js';

export class CreateUserUseCase {
  constructor(
    private readonly repository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async execute(input: CreateUserInput): Promise<User> {
    const data = validateUser(input);

    const existing = await this.repository.findByEmail(data.email);
    if (existing) {
      throw new UserEmailInUseError(data.email);
    }

    const passwordHash = await this.passwordHasher.hash(data.password);
    const { password: _plaintext, ...normalized } = data;
    return this.repository.create({ ...normalized, passwordHash });
  }
}
