import { DomainError } from '../errors/domain.error.js';

export interface ClienteProps {
  readonly nome: string;
  readonly email: string;
  readonly telefone: string;
  readonly endereco: string;
}

export interface Cliente extends ClienteProps {
  readonly id: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ClienteInvalidoError extends DomainError {
  constructor(message: string) {
    super('CLIENTE_INVALIDO', message);
  }
}

function assertPropriedade(valor: string, campo: string, minimo: number): void {
  const trimmed = valor.trim();
  if (trimmed.length < minimo) {
    throw new ClienteInvalidoError(`${campo} deve ter no mínimo ${minimo} caracteres`);
  }
  if (trimmed.length > 255) {
    throw new ClienteInvalidoError(`${campo} deve ter no máximo 255 caracteres`);
  }
}

export function validarCliente(dados: ClienteProps): ClienteProps {
  assertPropriedade(dados.nome, 'nome', 2);
  const email = dados.email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    throw new ClienteInvalidoError('email inválido');
  }
  assertPropriedade(dados.telefone, 'telefone', 8);
  assertPropriedade(dados.endereco, 'endereco', 5);
  return { nome: dados.nome.trim(), email, telefone: dados.telefone.trim(), endereco: dados.endereco.trim() };
}
