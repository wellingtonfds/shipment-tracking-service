import { User, assertEmail } from '../../../domain/users/user.entity.js';
import { InvalidCredentialsError } from '../../../domain/users/errors/invalid-credentials.error.js';
import { UserRepositoryPort } from '../../../domain/users/ports/user-repository.port.js';
import { PasswordHasherPort } from '../ports/password-hasher.port.js';
import { TokenServicePort } from '../ports/token-service.port.js';

export interface LoginResult {
  readonly token: string;
  readonly user: User;
}

export class LoginUseCase {
  constructor(
    private readonly repository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly tokenService: TokenServicePort,
  ) {}

  async execute(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = assertEmail(email);

    const user = await this.repository.findByEmail(normalizedEmail);
    if (!user || !user.active) {
      throw new InvalidCredentialsError();
    }

    const matches = await this.passwordHasher.compare(password, user.passwordHash ?? '');
    if (!matches) {
      throw new InvalidCredentialsError();
    }

    const token = await this.tokenService.sign({ userId: user.id, role: user.role, customerId: user.customerId });
    return { token, user };
  }
}
