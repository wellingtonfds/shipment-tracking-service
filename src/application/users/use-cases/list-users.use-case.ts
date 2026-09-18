import { PaginatedUsers, UserListFilters, UserRepositoryPort } from '../../../domain/users/ports/user-repository.port.js';

export class ListUsersUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(page = 1, limit = 10, filters: UserListFilters = {}): Promise<PaginatedUsers> {
    const [data, total] = await Promise.all([this.repository.findMany(page, limit, filters), this.repository.count(filters)]);

    return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }
}
