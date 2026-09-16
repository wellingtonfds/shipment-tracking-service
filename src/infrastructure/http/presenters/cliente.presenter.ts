import { ApiProperty } from '@nestjs/swagger';
import { Cliente } from '../../../domain/entities/cliente.entity.js';

export class ClientePresenter {
  @ApiProperty({ type: Number, example: 1, description: 'Identificador único do cliente' })
  id!: number;

  @ApiProperty({ example: 'Maria Silva', description: 'Nome completo do cliente' })
  nome!: string;

  @ApiProperty({ example: 'maria.silva@example.com', description: 'Email do cliente (único)', format: 'email' })
  email!: string;

  @ApiProperty({ example: '(11) 98888-7777', description: 'Telefone do cliente' })
  telefone!: string;

  @ApiProperty({ example: 'Av. Paulista, 1000 - apto 42', description: 'Endereço do cliente' })
  endereco!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-16T20:30:00.000Z', description: 'Data de criação' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-16T20:30:00.000Z', description: 'Data da última atualização' })
  updatedAt!: string;

  static fromEntity(cliente: Cliente): ClientePresenter {
    const presenter = new ClientePresenter();
    presenter.id = cliente.id;
    presenter.nome = cliente.nome;
    presenter.email = cliente.email;
    presenter.telefone = cliente.telefone;
    presenter.endereco = cliente.endereco;
    presenter.createdAt = cliente.createdAt.toISOString();
    presenter.updatedAt = cliente.updatedAt.toISOString();
    return presenter;
  }
}

export class ListClientesMetaPresenter {
  @ApiProperty({ type: Number, example: 15, description: 'Total de clientes' })
  total!: number;

  @ApiProperty({ type: Number, example: 1, description: 'Página atual' })
  page!: number;

  @ApiProperty({ type: Number, example: 10, description: 'Itens por página' })
  limit!: number;

  @ApiProperty({ type: Number, example: 2, description: 'Total de páginas' })
  totalPages!: number;
}

export class ListClientesPresenter {
  @ApiProperty({ type: [ClientePresenter], description: 'Clientes da página' })
  data!: ClientePresenter[];

  @ApiProperty({ type: ListClientesMetaPresenter, description: 'Metadados da paginação' })
  meta!: ListClientesMetaPresenter;

  static fromPaginated(resultado: { data: Cliente[]; total: number; page: number; limit: number; totalPages: number }): ListClientesPresenter {
    const presenter = new ListClientesPresenter();
    presenter.data = resultado.data.map((cliente) => ClientePresenter.fromEntity(cliente));
    presenter.meta = new ListClientesMetaPresenter();
    presenter.meta.total = resultado.total;
    presenter.meta.page = resultado.page;
    presenter.meta.limit = resultado.limit;
    presenter.meta.totalPages = resultado.totalPages;
    return presenter;
  }
}
