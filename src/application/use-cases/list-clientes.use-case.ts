import { ClienteRepositoryPort } from '../../domain/ports/cliente-repository.port.js';

export class ListClientesUseCase {
  constructor(private readonly repository: ClienteRepositoryPort) {}

  async execute(page = 1, limit = 10): Promise<{ data: Awaited<ReturnType<ClienteRepositoryPort['findMany']>>; total: number; page: number; limit: number; totalPages: number }> {
    const [data, total] = await Promise.all([this.repository.findMany(page, limit), this.repository.count()]);

    return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }
}
