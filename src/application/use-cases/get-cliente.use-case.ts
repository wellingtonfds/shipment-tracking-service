import { ClienteRepositoryPort } from '../../domain/ports/cliente-repository.port.js';
import { ClienteNotFoundError } from '../../domain/errors/cliente-not-found.error.js';

export class GetClienteUseCase {
  constructor(private readonly repository: ClienteRepositoryPort) {}

  async execute(id: number) {
    const cliente = await this.repository.findById(id);
    if (!cliente) {
      throw new ClienteNotFoundError(id);
    }
    return cliente;
  }
}
