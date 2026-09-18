import { describe, expect, it, vi } from 'vitest';
import { CreateUserInput } from '../../../domain/users/user.entity.js';
import { UserCredentials, UserListFilters, UserRepositoryPort } from '../../../domain/users/ports/user-repository.port.js';
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
  customerId: null,
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

  it('forbids customer link for OPERATOR users', async () => {
    const useCase = new CreateUserUseCase(fakeRepository(), fakeHasher());

    await expect(useCase.execute({ ...operatorInput, customerId: 5 })).rejects.toMatchObject({ code: 'USER_CUSTOMER_LINK_INVALID' });
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

    await expect(new UpdateUserUseCase(repository, fakeHasher()).execute(1, { role: 'CUSTOMER' })).rejects.toMatchObject({
      code: 'USER_CUSTOMER_LINK_INVALID',
    });

    const updated = await new UpdateUserUseCase(repository, fakeHasher()).execute(1, { role: 'CUSTOMER', customerId: 7 });
    expect(updated).toMatchObject({ role: 'CUSTOMER', customerId: 7 });
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
    await create.execute({ ...operatorInput, email: 'admin@example.com', role: 'ADMINISTRATOR' });
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

describe('GetMyProfileUseCase', () => {
  it('returns the own profile', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput);

    const profile = await new GetMyProfileUseCase(repository).execute(1);
    expect(profile).toMatchObject({ id: 1 });
  });

  it('denies inactive users', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput);
    await new DeleteUserUseCase(repository).execute(1);

    await expect(new GetMyProfileUseCase(repository).execute(1)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('UpdateMyProfileUseCase', () => {
  it('updates only name, email and password', async () => {
    const repository = fakeRepository();
    await new CreateUserUseCase(repository, fakeHasher()).execute(operatorInput);

    const updated = await new UpdateMyProfileUseCase(repository, fakeHasher()).execute(1, { name: 'New Name', email: 'new@example.com' });

    expect(updated).toMatchObject({ name: 'New Name', email: 'new@example.com', role: 'OPERATOR', active: true, customerId: null });
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
