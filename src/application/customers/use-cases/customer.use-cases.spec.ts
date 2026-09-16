import { describe, expect, it, vi } from 'vitest';
import { CustomerRepositoryPort, UpdateCustomerData } from '../../../domain/customers/ports/customer-repository.port.js';
import { CreateCustomerUseCase } from './create-customer.use-case.js';
import { GetCustomerUseCase } from './get-customer.use-case.js';
import { UpdateCustomerUseCase } from './update-customer.use-case.js';
import { DeleteCustomerUseCase } from './delete-customer.use-case.js';
import { ListCustomersUseCase } from './list-customers.use-case.js';
import { CustomerNotFoundError } from '../../../domain/customers/errors/customer-not-found.error.js';

function fakeRepository(): CustomerRepositoryPort {
  const records = new Map<number, { name: string; email: string; phone: string; address: string; id: number; createdAt: Date; updatedAt: Date }>();
  return {
    findMany: vi.fn(async (page: number, limit: number) => [...records.values()].slice((page - 1) * limit, page * limit)),
    count: vi.fn(async () => records.size),
    findById: vi.fn(async (id: number) => records.get(id) ?? null),
    findByEmail: vi.fn(async (email: string) => [...records.values()].find((c) => c.email === email) ?? null),
    create: vi.fn(async (data) => {
      const id = records.size + 1;
      const created = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
      records.set(id, created);
      return created;
    }),
    update: vi.fn(async (id: number, data: UpdateCustomerData) => {
      const current = records.get(id)!;
      const updated = { ...current, ...data, updatedAt: new Date() };
      records.set(id, updated);
      return updated;
    }),
    delete: vi.fn(async (id: number) => {
      records.delete(id);
    }),
  };
}

describe('CreateCustomerUseCase', () => {
  it('creates customer with valid data (normalizes email)', async () => {
    const repository = fakeRepository();
    const useCase = new CreateCustomerUseCase(repository);

    const result = await useCase.execute({
      name: '  Maria Silva  ',
      email: 'MARIA@Example.COM',
      phone: ' 11988887777 ',
      address: 'Av. Paulista, 1000',
    });

    expect(result.email).toBe('maria@example.com');
    expect(result.name).toBe('Maria Silva');
  });

  it('rejects email already in use', async () => {
    const repository = fakeRepository();
    await new CreateCustomerUseCase(repository).execute({ name: 'João', email: 'joao@example.com', phone: '11999998888', address: 'Rua B, 12' });

    await expect(
      new CreateCustomerUseCase(repository).execute({ name: 'João 2', email: 'joao@example.com', phone: '11999998888', address: 'Rua B, 12' }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_EMAIL_IN_USE' });
  });

  it('rejects invalid data', async () => {
    const useCase = new CreateCustomerUseCase(fakeRepository());

    await expect(useCase.execute({ name: 'X', email: 'a@b.com', phone: '11999998888', address: 'Rua B, 12' })).rejects.toMatchObject({
      code: 'CUSTOMER_INVALID',
    });
  });
});

describe('GetCustomerUseCase', () => {
  it('returns existing customer', async () => {
    const repository = fakeRepository();
    await new CreateCustomerUseCase(repository).execute({ name: 'Ana', email: 'ana@example.com', phone: '11977776666', address: 'Rua C, 33' });

    const customer = await new GetCustomerUseCase(repository).execute(1);

    expect(customer).toMatchObject({ id: 1, email: 'ana@example.com' });
  });

  it('throws CUSTOMER_NOT_FOUND for missing id', async () => {
    await expect(new GetCustomerUseCase(fakeRepository()).execute(999)).rejects.toBeInstanceOf(CustomerNotFoundError);
  });
});

describe('UpdateCustomerUseCase', () => {
  it('updates fields partially', async () => {
    const repository = fakeRepository();
    await new CreateCustomerUseCase(repository).execute({ name: 'Bruno', email: 'bruno@example.com', phone: '11966665555', address: 'Rua D, 44' });

    const updated = await new UpdateCustomerUseCase(repository).execute(1, { phone: '11955554444' });

    expect(updated.phone).toBe('11955554444');
    expect(updated.email).toBe('bruno@example.com');
  });

  it('throws CUSTOMER_NOT_FOUND when updating missing id', async () => {
    await expect(new UpdateCustomerUseCase(fakeRepository()).execute(42, { name: 'Nobody' })).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  it('throws CUSTOMER_EMAIL_IN_USE when switching to another customer email', async () => {
    const repository = fakeRepository();
    const useCase = new CreateCustomerUseCase(repository);
    await useCase.execute({ name: 'One', email: 'one@example.com', phone: '11911111111', address: 'Rua E, 1' });
    await useCase.execute({ name: 'Two', email: 'two@example.com', phone: '11922222222', address: 'Rua F, 2' });

    await expect(new UpdateCustomerUseCase(repository).execute(1, { email: 'two@example.com' })).rejects.toMatchObject({ code: 'CUSTOMER_EMAIL_IN_USE' });
  });

  it('allows keeping the same email', async () => {
    const repository = fakeRepository();
    await new CreateCustomerUseCase(repository).execute({ name: 'Three', email: 'three@example.com', phone: '11933333333', address: 'Rua G, 3' });

    const updated = await new UpdateCustomerUseCase(repository).execute(1, { email: 'three@example.com', name: 'Three Updated' });

    expect(updated.name).toBe('Three Updated');
  });
});

describe('DeleteCustomerUseCase', () => {
  it('removes existing customer', async () => {
    const repository = fakeRepository();
    await new CreateCustomerUseCase(repository).execute({ name: 'Four', email: 'four@example.com', phone: '11944444444', address: 'Rua H, 4' });

    await new DeleteCustomerUseCase(repository).execute(1);

    await expect(new GetCustomerUseCase(repository).execute(1)).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  it('throws CUSTOMER_NOT_FOUND when removing missing id', async () => {
    await expect(new DeleteCustomerUseCase(fakeRepository()).execute(77)).rejects.toBeInstanceOf(CustomerNotFoundError);
  });
});

describe('ListCustomersUseCase', () => {
  it('returns correct pagination', async () => {
    const repository = fakeRepository();
    const create = new CreateCustomerUseCase(repository);
    for (let i = 1; i <= 15; i++) {
      await create.execute({ name: `Customer ${i}`, email: `c${i}@example.com`, phone: `1190000000${i}`, address: `Street ${i}, ${i}` });
    }

    const page2 = await new ListCustomersUseCase(repository).execute(2, 10);

    expect(page2.total).toBe(15);
    expect(page2.totalPages).toBe(2);
    expect(page2.data).toHaveLength(5);
    expect(page2.data[0].email).toBe('c11@example.com');
  });

  it('returns totalPages=1 for empty list', async () => {
    const result = await new ListCustomersUseCase(fakeRepository()).execute(1, 10);

    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(1);
    expect(result.data).toEqual([]);
  });
});
