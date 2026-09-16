import { CustomerRepositoryPort } from '../../../domain/customers/ports/customer-repository.port.js';
import { CustomerNotFoundError } from '../../../domain/customers/errors/customer-not-found.error.js';

export class DeleteCustomerUseCase {
  constructor(private readonly repository: CustomerRepositoryPort) {}

  async execute(id: number): Promise<void> {
    const current = await this.repository.findById(id);
    if (!current) {
      throw new CustomerNotFoundError(id);
    }
    await this.repository.delete(id);
  }
}
