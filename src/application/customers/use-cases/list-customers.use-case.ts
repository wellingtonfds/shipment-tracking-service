import { CustomerRepositoryPort } from '../../../domain/customers/ports/customer-repository.port.js';

export class ListCustomersUseCase {
  constructor(private readonly repository: CustomerRepositoryPort) {}

  async execute(page = 1, limit = 10): Promise<{ data: Awaited<ReturnType<CustomerRepositoryPort['findMany']>>; total: number; page: number; limit: number; totalPages: number }> {
    const [data, total] = await Promise.all([this.repository.findMany(page, limit), this.repository.count()]);

    return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }
}
