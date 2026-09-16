import { CustomerRepositoryPort } from '../../../domain/customers/ports/customer-repository.port.js';
import { CustomerNotFoundError } from '../../../domain/customers/errors/customer-not-found.error.js';

export class GetCustomerUseCase {
  constructor(private readonly repository: CustomerRepositoryPort) {}

  async execute(id: number) {
    const customer = await this.repository.findById(id);
    if (!customer) {
      throw new CustomerNotFoundError(id);
    }
    return customer;
  }
}
