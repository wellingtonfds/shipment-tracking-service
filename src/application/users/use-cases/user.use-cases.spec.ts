import { describe, expect, it, vi } from 'vitest';
import { CreateUserInput } from '../../../domain/users/user.entity.js';
import { UserCredentials, UserListFilters, UserRepositoryPort } from '../../../domain/users/ports/user-repository.port.js';
import { CustomerRepositoryPort } from '../../../domain/customers/ports/customer-repository.port.js';
import type { Customer } from '../../../domain/customers/customer.entity.js';
import { PasswordHasherPort } from '../ports/password-hasher.port.js';
import { TokenServicePort } from '../ports/token-service.port.js';
import { CreateUserUseCase } from './create-user.use-case.js';
import { GetUserUseCase } from './get-user.use-case.js';
import { ListUsersUseCase } from './list-users.use-case.js';
import { UpdateUserUseCase } from './update-user.use-case.js';
import { DeleteUserUseCase } from './delete-user.use-case.js';
import { GetMyProfileUseCase } from './get-my-profile.use-case.js';
import { UpdateMyProfileUseCase } from './update-my-profile.use-case.js';
import { LoginUseCase } from './login.use-case.js';
import { UserNotFoundError } from '../../../domain/users/errors/user-not-found.error.js';

function fakeRepository(): UserRepositoryPort {
  const records = new Map<number, UserCredentials>();
  return {
    findMany: vi.fn(async (page: number, limit: number, filters: UserListFilters = {}) => {
      const filtered = [...records.values()].filter(
        (u) => (filters.role === undefined || u.role === filters.role) && (filters.active === undefined || u.active === filters.active),
      );
      return filtered.slice((page - 1) * limit, page * limit).map(({ passwordHash: _passwordHash, ...user }) => user);
    }),
    count: vi.fn(async (filters: UserListFilters = {}) =>
      [...records.values()].filter(
        (u) => (filters.role === undefined || u.role === filters.role) && (filters.active === undefined || u.active === filters.active),
      ).length,
    ),
    findById: vi.fn(async (id: number) => {
      const record = records.get(id) ?? null;
      if (!record) return null;
      const { passwordHash: _passwordHash, ...user } = record;
      return user;
    }),
    findByEmail: vi.fn(async (email: string) => [...records.values()].find((u) => u.email === email) ?? null),
    create: vi.fn(async (data) => {
      const id = records.size + 1;
      const created: UserCredentials = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
      records.set(id, created);
      const { passwordHash: _passwordHash, ...user } = created;
      return user;
    }),
    update: vi.fn(async (id: number, data) => {
      const current = records.get(id)!;
      const updated: UserCredentials = {
        ...current,
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.passwordHash !== undefined ? { passwordHash: data.passwordHash } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...('customerId' in data ? { customerId: data.customerId! } : {}),
        updatedAt: new Date(),
      };
      records.set(id, updated);
      const { passwordHash: _passwordHash, ...user } = updated;
      return user;
    }),
    softDelete: vi.fn(async (id: number) => {
      const current = records.get(id)!;
      const updated = { ...current, active: false, updatedAt: new Date() };
      records.set(id, updated);
      const { passwordHash: _passwordHash, ...user } = updated;
      return user;
    }),
  };
}

function fakeHasher(): PasswordHasherPort {
  return {
    hash: vi.fn(async (plaintext: string) => `hashed:${plaintext}`),
    compare: vi.fn(async (plaintext: string, passwordHash: string) => passwordHash === `hashed:${plaintext}`),
  };
}

function fakeTokens(): TokenServicePort {
  return {
    sign: vi.fn(async (payload) => `token:${payload.userId}:${payload.role}`),
    verify: vi.fn(() => ({ userId: 1, role: 'OPERATOR', customerId: null })),
  };
}

const operatorInput: CreateUserInput = {
  name: 'Sergio Nogueira',
  email: 'op@example.com',
  password: 'Senha123!',
  role: 'OPERATOR',
  active: true,
  customerId: 3,
};

describe('CreateUserUseCase', () => {
  it('creates user with valid data (normalizes email and role case)', async () => {
    const repository = fakeRepository();
    const useCase = new CreateUserUseCase(repository, fakeHasher());

    const result = await useCase.execute({ ...operatorInput, email: 'OP@Example.COM', role: 'operator' });

    expect(result.email).toBe('op@example.com');
    expect(result.role).toBe('OPERATOR');
    expect(result.active).toBe(true);
  });

  it('rejects email already in use', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput);

    await expect(new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput)).rejects.toMatchObject({ code: 'USER_EMAIL_IN_USE' });
  });

  it('requires customerId for CUSTOMER users', async () => {
    const useCase = new CreateUserUseCase(fakeRepository(), fakeHasher());

    await expect(
      useCase.execute({ ...operatorInput, email: 'portal@example.com', role: 'CUSTOMER', customerId: null }),
    ).rejects.toMatchObject({ code: 'USER_CUSTOMER_LINK_INVALID' });
  });

  it('requires customer link for OPERATOR users', async () => {
    const useCase = new CreateUserUseCase(fakeRepository(), fakeHasher());

    await expect(useCase.execute({ ...operatorInput, customerId: null })).rejects.toMatchObject({ code: 'USER_CUSTOMER_LINK_INVALID' });
  });

  it('forbids customer link for ADMINISTRATOR users', async () => {
    const useCase = new CreateUserUseCase(fakeRepository(), fakeHasher());

    await expect(useCase.execute({ ...operatorInput, email: 'admin2@example.com', role: 'ADMINISTRATOR', customerId: 5 })).rejects.toMatchObject({
      code: 'USER_CUSTOMER_LINK_INVALID',
    });
  });

  it('rejects short passwords', async () => {
    const useCase = new CreateUserUseCase(fakeRepository(), fakeHasher());

    await expect(useCase.execute({ ...operatorInput, password: 'short' })).rejects.toMatchObject({ code: 'USER_INVALID' });
  });

  it('accepts CUSTOMER with valid customer link', async () => {
    const repository = fakeRepository();
    const result = await new CreateUserUseCase(repository, fakeHasher()).execute({
      ...operatorInput,
      email: 'portal@example.com',
      role: 'CUSTOMER',
      customerId: 3,
    });

    expect(result).toMatchObject({ role: 'CUSTOMER', customerId: 3 });
  });
});

describe('GetUserUseCase', () => {
  it('returns existing user', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput);

    const user = await new GetUserUseCase(repository).execute(1);

    expect(user).toMatchObject({ id: 1, email: 'op@example.com' });
  });

  it('throws USER_NOT_FOUND for missing id', async () => {
    await expect(new GetUserUseCase(fakeRepository()).execute(999)).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('UpdateUserUseCase', () => {
  it('updates fields partially', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput);

    const updated = await new UpdateUserUseCase(repository, fakeHasher()).execute(1, { name: 'Sergio Updated' });

    expect(updated.name).toBe('Sergio Updated');
    expect(updated.email).toBe('op@example.com');
  });

  it('throws USER_NOT_FOUND when updating missing id', async () => {
    await expect(new UpdateUserUseCase(fakeRepository(), fakeHasher()).execute(42, { name: 'Nobody' })).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('throws USER_EMAIL_IN_USE when switching to another user email', async () => {
    const repository = fakeRepository();
    const create = new CreateUserUseCase(repository, fakeHasher());
    await create.execute(operatorInput);
    await create.execute({ ...operatorInput, email: 'other@example.com' });

    await expect(new UpdateUserUseCase(repository, fakeHasher()).execute(1, { email: 'other@example.com' })).rejects.toMatchObject({
      code: 'USER_EMAIL_IN_USE',
    });
  });

  it('revalidates the customer link when changing role', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput);

    // OPERATOR -> CUSTOMER keeps the existing link: valid
    const asCustomer = await new UpdateUserUseCase(repository, fakeHasher()).execute(1, { role: 'CUSTOMER' });
    expect(asCustomer).toMatchObject({ role: 'CUSTOMER', customerId: 3 });

    // CUSTOMER -> ADMINISTRATOR requires unlinking first
    await expect(new UpdateUserUseCase(repository, fakeHasher()).execute(1, { role: 'ADMINISTRATOR' })).rejects.toMatchObject({
      code: 'USER_CUSTOMER_LINK_INVALID',
    });

    const asAdmin = await new UpdateUserUseCase(repository, fakeHasher()).execute(1, { role: 'ADMINISTRATOR', customerId: null });
    expect(asAdmin).toMatchObject({ role: 'ADMINISTRATOR', customerId: null });
  });
});

describe('DeleteUserUseCase', () => {
  it('deactivates instead of removing (soft-delete)', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput);

    const result = await new DeleteUserUseCase(repository).execute(1);

    expect(result.active).toBe(false);
    expect(await repository.findById(1)).not.toBeNull();
  });

  it('throws USER_NOT_FOUND when deactivating missing id', async () => {
    await expect(new DeleteUserUseCase(fakeRepository()).execute(77)).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('ListUsersUseCase', () => {
  it('supports filters and pagination', async () => {
    const repository = fakeRepository();
    const create = new CreateUserUseCase(repository, fakeHasher());
    await create.execute(operatorInput);
    await create.execute({ ...operatorInput, email: 'admin@example.com', role: 'ADMINISTRATOR', customerId: null });
    await create.execute({ ...operatorInput, email: 'portal@example.com', role: 'CUSTOMER', customerId: 2 });

    const operators = await new ListUsersUseCase(repository).execute(1, 10, { role: 'OPERATOR' });
    expect(operators.total).toBe(1);
    expect(operators.data).toHaveLength(1);

    const all = await new ListUsersUseCase(repository).execute(1, 2);
    expect(all.total).toBe(3);
    expect(all.totalPages).toBe(2);
    expect(all.data).toHaveLength(2);
  });
});

function fakeCustomers(): CustomerRepositoryPort {
  const customer: Customer = {
    id: 3,
    name: 'Maria Silva',
    email: 'maria.silva@example.com',
    phone: '(11) 98888-7777',
    address: 'Av. Paulista, 1000',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
    findMany: vi.fn(async () => [customer]),
    count: vi.fn(async () => 1),
    findById: vi.fn(async (id: number) => (id === customer.id ? customer : null)),
    findByEmail: vi.fn(async () => customer),
    create: vi.fn(async (data) => ({ ...data, id: customer.id, createdAt: new Date(), updatedAt: new Date() })),
    update: vi.fn(async (id: number, data) => ({ ...customer, ...data, id })),
    delete: vi.fn(async () => undefined),
  };
}

describe('GetMyProfileUseCase', () => {
  it('returns the own profile without customer for ADMINISTRATOR (unlinked)', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute({
      ...operatorInput,
      email: 'admin2@example.com',
      role: 'ADMINISTRATOR',
      customerId: null,
    });

    const result = await new GetMyProfileUseCase(repository, fakeCustomers()).execute(1);

    expect(result.user).toMatchObject({ id: 1, role: 'ADMINISTRATOR' });
    expect(result.customer).toBeNull();
  });

  it('embeds the linked customer for OPERATOR users', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput);

    const result = await new GetMyProfileUseCase(repository, fakeCustomers()).execute(1);

    expect(result.user).toMatchObject({ id: 1, role: 'OPERATOR', customerId: 3 });
    expect(result.customer).toMatchObject({ id: 3, email: 'maria.silva@example.com' });
  });

  it('embeds the linked customer for CUSTOMER users', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute({
      ...operatorInput,
      email: 'portal@example.com',
      role: 'CUSTOMER',
      customerId: 3,
    });

    const result = await new GetMyProfileUseCase(repository, fakeCustomers()).execute(1);

    expect(result.user).toMatchObject({ id: 1, role: 'CUSTOMER', customerId: 3 });
    expect(result.customer).toMatchObject({ id: 3, email: 'maria.silva@example.com' });
  });

  it('denies inactive users', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput);
    await new DeleteUserUseCase(repository).execute(1);

    await expect(new GetMyProfileUseCase(repository, fakeCustomers()).execute(1)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('UpdateMyProfileUseCase', () => {
  it('updates only name, email and password', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput);

    const updated = await new UpdateMyProfileUseCase(repository, fakeHasher()).execute(1, { name: 'New Name', email: 'new@example.com' });

    expect(updated).toMatchObject({ name: 'New Name', email: 'new@example.com', role: 'OPERATOR', active: true, customerId: 3 });
  });

  it('throws USER_EMAIL_IN_USE when email belongs to another user', async () => {
    const repository = fakeRepository();
    const create = new CreateUserUseCase(repository, fakeHasher());
    await create.execute(operatorInput);
    await create.execute({ ...operatorInput, email: 'other@example.com' });

    await expect(new UpdateMyProfileUseCase(repository, fakeHasher()).execute(1, { email: 'other@example.com' })).rejects.toMatchObject({
      code: 'USER_EMAIL_IN_USE',
    });
  });
});

describe('LoginUseCase', () => {
  it('returns token and user with correct credentials', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput);

    const result = await new LoginUseCase(repository, fakeHasher(), fakeTokens()).execute('op@example.com', 'Senha123!');

    expect(result.token).toBe('token:1:OPERATOR');
    expect(result.user).toMatchObject({ id: 1, email: 'op@example.com' });
  });

  it('rejects unknown email without leaking existence', async () => {
    await expect(new LoginUseCase(fakeRepository(), fakeHasher(), fakeTokens()).execute('ghost@example.com', 'Senha123!')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rejects wrong password', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput);

    await expect(new LoginUseCase(repository, fakeHasher(), fakeTokens()).execute('op@example.com', 'WrongPass9')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rejects inactive users', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput);
    await new DeleteUserUseCase(repository).execute(1);

    await expect(new LoginUseCase(repository, fakeHasher(), fakeTokens()).execute('op@example.com', 'Senha123!')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });
});
