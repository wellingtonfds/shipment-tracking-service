import { validateCustomer, Customer, CustomerProps } from '../../../domain/customers/customer.entity.js';
import { CustomerRepositoryPort } from '../../../domain/customers/ports/customer-repository.port.js';
import { CustomerEmailInUseError } from '../../../domain/customers/errors/customer-email-in-use.error.js';

export class CreateCustomerUseCase {
  constructor(private readonly repository: CustomerRepositoryPort) {}

  async execute(input: CustomerProps): Promise<Customer> {
    const data = validateCustomer(input);

    const existing = await this.repository.findByEmail(data.email);
    if (existing) {
      throw new CustomerEmailInUseError(data.email);
    }

    return this.repository.create(data);
  }
}
