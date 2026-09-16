import { Cliente, validarCliente } from '../../domain/entities/cliente.entity.js';
import { ClienteRepositoryPort } from '../../domain/ports/cliente-repository.port.js';
import { ClienteEmailInUseError } from '../../domain/errors/cliente-email-in-use.error.js';
import { ClienteProps } from '../../domain/entities/cliente.entity.js';

export class CreateClienteUseCase {
  constructor(private readonly repository: ClienteRepositoryPort) {}

  async execute(entrada: ClienteProps): Promise<Cliente> {
    const dados = validarCliente(entrada);

    const existente = await this.repository.findByEmail(dados.email);
    if (existente) {
      throw new ClienteEmailInUseError(dados.email);
    }

    return this.repository.create(dados);
  }
}
