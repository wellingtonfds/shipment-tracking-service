import { ClienteRepositoryPort } from '../../domain/ports/cliente-repository.port.js';
import { ClienteNotFoundError } from '../../domain/errors/cliente-not-found.error.js';

export class DeleteClienteUseCase {
  constructor(private readonly repository: ClienteRepositoryPort) {}

  async execute(id: number): Promise<void> {
    const atual = await this.repository.findById(id);
    if (!atual) {
      throw new ClienteNotFoundError(id);
    }
    await this.repository.delete(id);
  }
}
