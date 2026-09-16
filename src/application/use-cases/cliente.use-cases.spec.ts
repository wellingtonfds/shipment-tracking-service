import { describe, expect, it, vi } from 'vitest';
import { ClienteRepositoryPort, AtualizarClienteDados } from '../../domain/ports/cliente-repository.port.js';
import { CreateClienteUseCase } from './create-cliente.use-case.js';
import { GetClienteUseCase } from './get-cliente.use-case.js';
import { UpdateClienteUseCase } from './update-cliente.use-case.js';
import { DeleteClienteUseCase } from './delete-cliente.use-case.js';
import { ListClientesUseCase } from './list-clientes.use-case.js';
import { ClienteNotFoundError } from '../../domain/errors/cliente-not-found.error.js';

function fakeRepository(): ClienteRepositoryPort {
  const registros = new Map<number, Cliente>();
  return {
    findMany: vi.fn(async (page: number, limit: number) => [...registros.values()].slice((page - 1) * limit, page * limit)),
    count: vi.fn(async () => registros.size),
    findById: vi.fn(async (id: number) => registros.get(id) ?? null),
    findByEmail: vi.fn(async (email: string) => [...registros.values()].find((c) => c.email === email) ?? null),
    create: vi.fn(async (dados) => {
      const id = registros.size + 1;
      const criado = { ...dados, id, createdAt: new Date(), updatedAt: new Date() };
      registros.set(id, criado);
      return criado;
    }),
    update: vi.fn(async (id: number, dados: AtualizarClienteDados) => {
      const atual = registros.get(id)!;
      const atualizado = { ...atual, ...dados, updatedAt: new Date() };
      registros.set(id, atualizado);
      return atualizado;
    }),
    delete: vi.fn(async (id: number) => {
      registros.delete(id);
    }),
  };
}

describe('CreateClienteUseCase', () => {
  it('cria cliente com dados válidos (normaliza email)', async () => {
    const repository = fakeRepository();
    const useCase = new CreateClienteUseCase(repository);

    const resultado = await useCase.execute({
      nome: '  Maria Silva  ',
      email: 'MARIA@Example.COM',
      telefone: ' 11988887777 ',
      endereco: 'Av. Paulista, 1000',
    });

    expect(resultado.email).toBe('maria@example.com');
    expect(resultado.nome).toBe('Maria Silva');
  });

  it('rejeita email já em uso', async () => {
    const repository = fakeRepository();
    await new CreateClienteUseCase(repository).execute({ nome: 'João', email: 'joao@example.com', telefone: '11999998888', endereco: 'Rua B, 12' });

    await expect(
      new CreateClienteUseCase(repository).execute({ nome: 'João 2', email: 'joao@example.com', telefone: '11999998888', endereco: 'Rua B, 12' }),
    ).rejects.toMatchObject({ code: 'CLIENTE_EMAIL_IN_USE' });
  });

  it('rejeita dados inválidos', async () => {
    const useCase = new CreateClienteUseCase(fakeRepository());

    await expect(useCase.execute({ nome: 'X', email: 'a@b.com', telefone: '11999998888', endereco: 'Rua B, 12' })).rejects.toMatchObject({
      code: 'CLIENTE_INVALIDO',
    });
  });
});

describe('GetClienteUseCase', () => {
  it('retorna cliente existente', async () => {
    const repository = fakeRepository();
    await new CreateClienteUseCase(repository).execute({ nome: 'Ana', email: 'ana@example.com', telefone: '11977776666', endereco: 'Rua C, 33' });

    const cliente = await new GetClienteUseCase(repository).execute(1);

    expect(cliente).toMatchObject({ id: 1, email: 'ana@example.com' });
  });

  it('lança CLIENTE_NOT_FOUND para id inexistente', async () => {
    await expect(new GetClienteUseCase(fakeRepository()).execute(999)).rejects.toBeInstanceOf(ClienteNotFoundError);
  });
});

describe('UpdateClienteUseCase', () => {
  it('atualiza campos parciais', async () => {
    const repository = fakeRepository();
    await new CreateClienteUseCase(repository).execute({ nome: 'Bruno', email: 'bruno@example.com', telefone: '11966665555', endereco: 'Rua D, 44' });

    const atualizado = await new UpdateClienteUseCase(repository).execute(1, { telefone: '11955554444' });

    expect(atualizado.telefone).toBe('11955554444');
    expect(atualizado.email).toBe('bruno@example.com');
  });

  it('lança CLIENTE_NOT_FOUND ao atualizar id inexistente', async () => {
    await expect(new UpdateClienteUseCase(fakeRepository()).execute(42, { nome: 'Ninguém' })).rejects.toBeInstanceOf(ClienteNotFoundError);
  });

  it('lança CLIENTE_EMAIL_IN_USE ao trocar para email de outro cliente', async () => {
    const repository = fakeRepository();
    const useCase = new CreateClienteUseCase(repository);
    await useCase.execute({ nome: 'Um', email: 'um@example.com', telefone: '11911111111', endereco: 'Rua E, 1' });
    await useCase.execute({ nome: 'Dois', email: 'dois@example.com', telefone: '11922222222', endereco: 'Rua F, 2' });

    await expect(new UpdateClienteUseCase(repository).execute(1, { email: 'dois@example.com' })).rejects.toMatchObject({ code: 'CLIENTE_EMAIL_IN_USE' });
  });

  it('permite manter o próprio email', async () => {
    const repository = fakeRepository();
    await new CreateClienteUseCase(repository).execute({ nome: 'Três', email: 'tres@example.com', telefone: '11933333333', endereco: 'Rua G, 3' });

    const atualizado = await new UpdateClienteUseCase(repository).execute(1, { email: 'tres@example.com', nome: 'Três Atualizado' });

    expect(atualizado.nome).toBe('Três Atualizado');
  });
});

describe('DeleteClienteUseCase', () => {
  it('remove cliente existente', async () => {
    const repository = fakeRepository();
    await new CreateClienteUseCase(repository).execute({ nome: 'Quatro', email: 'quatro@example.com', telefone: '11944444444', endereco: 'Rua H, 4' });

    await new DeleteClienteUseCase(repository).execute(1);

    await expect(new GetClienteUseCase(repository).execute(1)).rejects.toBeInstanceOf(ClienteNotFoundError);
  });

  it('lança CLIENTE_NOT_FOUND ao remover id inexistente', async () => {
    await expect(new DeleteClienteUseCase(fakeRepository()).execute(77)).rejects.toBeInstanceOf(ClienteNotFoundError);
  });
});

describe('ListClientesUseCase', () => {
  it('retorna paginação correta', async () => {
    const repository = fakeRepository();
    const create = new CreateClienteUseCase(repository);
    for (let i = 1; i <= 15; i++) {
      await create.execute({ nome: `Cliente ${i}`, email: `c${i}@example.com`, telefone: `1190000000${i}`, endereco: `Rua ${i}, ${i}` });
    }

    const pagina2 = await new ListClientesUseCase(repository).execute(2, 10);

    expect(pagina2.total).toBe(15);
    expect(pagina2.totalPages).toBe(2);
    expect(pagina2.data).toHaveLength(5);
    expect(pagina2.data[0].email).toBe('c11@example.com');
  });

  it('retorna totalPages=1 para lista vazia', async () => {
    const resultado = await new ListClientesUseCase(fakeRepository()).execute(1, 10);

    expect(resultado.total).toBe(0);
    expect(resultado.totalPages).toBe(1);
    expect(resultado.data).toEqual([]);
  });
});
