import { User } from '../../../domain/users/user.entity.js';
import { Customer } from '../../../domain/customers/customer.entity.js';
import { UserNotFoundError } from '../../../domain/users/errors/user-not-found.error.js';
import { AccessDeniedError } from '../../../domain/users/errors/access-denied.error.js';
import { UserRepositoryPort } from '../../../domain/users/ports/user-repository.port.js';
import { CustomerRepositoryPort } from '../../../domain/customers/ports/customer-repository.port.js';

export interface MyProfileResult {
  readonly user: User;
  /** Linked customer (CUSTOMER profile) or null when there is no link or no record. */
  readonly customer: Customer | null;
}

export class GetMyProfileUseCase {
  constructor(
    private readonly repository: UserRepositoryPort,
    private readonly customers: CustomerRepositoryPort,
  ) {}

  async execute(userId: number): Promise<MyProfileResult> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }
    if (!user.active) {
      throw new AccessDeniedError('Inactive users cannot access their profile');
    }
    if (user.customerId === null) {
      return { user, customer: null };
    }
    const customer = await this.customers.findById(user.customerId);
    return { user, customer };
  }
}
