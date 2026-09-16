import { validateCustomer, Customer, CustomerProps } from '../../../domain/customers/customer.entity.js';
import { UpdateCustomerData, CustomerRepositoryPort } from '../../../domain/customers/ports/customer-repository.port.js';
import { CustomerNotFoundError } from '../../../domain/customers/errors/customer-not-found.error.js';
import { CustomerEmailInUseError } from '../../../domain/customers/errors/customer-email-in-use.error.js';

export class UpdateCustomerUseCase {
  constructor(private readonly repository: CustomerRepositoryPort) {}

  async execute(id: number, input: UpdateCustomerData): Promise<Customer> {
    const current = await this.repository.findById(id);
    if (!current) {
      throw new CustomerNotFoundError(id);
    }

    const merged: CustomerProps = {
      name: input.name ?? current.name,
      email: input.email ?? current.email,
      phone: input.phone ?? current.phone,
      address: input.address ?? current.address,
    };

    const data = validateCustomer(merged);

    if (data.email !== current.email) {
      const existing = await this.repository.findByEmail(data.email);
      if (existing && existing.id !== id) {
        throw new CustomerEmailInUseError(data.email);
      }
    }

    return this.repository.update(id, data);
  }
}
