import { Cliente, ClienteProps } from '../entities/cliente.entity.js';

export interface ClienteSemId {
  readonly nome: string;
  readonly email: string;
  readonly telefone: string;
  readonly endereco: string;
}

export interface AtualizarClienteDados {
  readonly nome?: string;
  readonly email?: string;
  readonly telefone?: string;
  readonly endereco?: string;
}

export interface ClientePaginado {
  readonly data: Cliente[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface ClienteRepositoryPort {
  findMany(page: number, limit: number): Promise<Cliente[]>;
  count(): Promise<number>;
  findById(id: number): Promise<Cliente | null>;
  findByEmail(email: string): Promise<Cliente | null>;
  create(dados: ClienteProps): Promise<Cliente>;
  update(id: number, dados: AtualizarClienteDados): Promise<Cliente>;
  delete(id: number): Promise<void>;
}
