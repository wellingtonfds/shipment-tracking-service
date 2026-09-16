import { validarCliente, Cliente, ClienteProps } from '../../domain/entities/cliente.entity.js';
import { AtualizarClienteDados, ClienteRepositoryPort } from '../../domain/ports/cliente-repository.port.js';
import { ClienteNotFoundError } from '../../domain/errors/cliente-not-found.error.js';
import { ClienteEmailInUseError } from '../../domain/errors/cliente-email-in-use.error.js';

export class UpdateClienteUseCase {
  constructor(private readonly repository: ClienteRepositoryPort) {}

  async execute(id: number, entrada: AtualizarClienteDados): Promise<Cliente> {
    const atual = await this.repository.findById(id);
    if (!atual) {
      throw new ClienteNotFoundError(id);
    }

    const mesclado: ClienteProps = {
      nome: entrada.nome ?? atual.nome,
      email: entrada.email ?? atual.email,
      telefone: entrada.telefone ?? atual.telefone,
      endereco: entrada.endereco ?? atual.endereco,
    };

    const dados = validarCliente(mesclado);

    if (dados.email !== atual.email) {
      const existente = await this.repository.findByEmail(dados.email);
      if (existente && existente.id !== id) {
        throw new ClienteEmailInUseError(dados.email);
      }
    }

    return this.repository.update(id, dados);
  }
}
