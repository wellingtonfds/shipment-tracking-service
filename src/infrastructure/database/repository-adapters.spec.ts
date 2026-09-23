import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { UserCustomerLinkInvalidError } from '../../domain/users/user.entity.js';
import { PrismaService } from './prisma.service.js';
import { PrismaCustomerRepositoryAdapter } from './customers/prisma-customer-repository.adapter.js';
import { PrismaUserRepositoryAdapter } from './users/prisma-user-repository.adapter.js';
import { PrismaHealthCheckAdapter } from './health/prisma-health-check.adapter.js';

const now = new Date('2026-01-01T00:00:00.000Z');
const customer = {
  id: 2,
  name: 'Customer',
  email: 'customer@example.com',
  phone: '123',
  address: 'Street',
  createdAt: now,
  updatedAt: now,
};
const user = {
  id: 7,
  name: 'Operator',
  email: 'operator@example.com',
  passwordHash: 'secret',
  role: 'OPERATOR',
  active: true,
  customerId: 2,
  createdAt: now,
  updatedAt: now,
};

describe('PrismaCustomerRepositoryAdapter', () => {
  function harness() {
    const prisma = {
      customer: {
        findMany: vi.fn().mockResolvedValue([customer]),
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue(customer),
        create: vi.fn().mockResolvedValue(customer),
        update: vi.fn().mockResolvedValue(customer),
        delete: vi.fn().mockResolvedValue(customer),
      },
    };
    return {
      prisma,
      adapter: new PrismaCustomerRepositoryAdapter(
        prisma as unknown as PrismaService,
      ),
    };
  }

  it('paginates and maps customer records', async () => {
    const { prisma, adapter } = harness();
    await expect(adapter.findMany(2, 5)).resolves.toEqual([customer]);
    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      orderBy: { id: 'asc' },
      skip: 5,
      take: 5,
    });
    await expect(adapter.count()).resolves.toBe(1);
    await expect(adapter.findById(2)).resolves.toEqual(customer);
    await expect(adapter.findByEmail(customer.email)).resolves.toEqual(
      customer,
    );
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(adapter.findById(99)).resolves.toBeNull();
  });

  it('passes create, update, and delete through to Prisma', async () => {
    const { prisma, adapter } = harness();
    const data = {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
    };
    await expect(adapter.create(data)).resolves.toEqual(customer);
    expect(prisma.customer.create).toHaveBeenCalledWith({ data });
    await expect(adapter.update(2, { name: 'Updated' })).resolves.toEqual(
      customer,
    );
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { name: 'Updated' },
    });
    await adapter.delete(2);
    expect(prisma.customer.delete).toHaveBeenCalledWith({ where: { id: 2 } });
  });
});

describe('PrismaUserRepositoryAdapter', () => {
  function harness() {
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([user]),
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue(user),
        create: vi.fn().mockResolvedValue(user),
        update: vi.fn().mockResolvedValue(user),
      },
    };
    return {
      prisma,
      adapter: new PrismaUserRepositoryAdapter(
        prisma as unknown as PrismaService,
      ),
    };
  }

  it('applies filters and hides the hash from normal reads', async () => {
    const { prisma, adapter } = harness();
    await expect(
      adapter.findMany(2, 5, { role: 'OPERATOR', active: true }),
    ).resolves.toEqual([
      expect.not.objectContaining({ passwordHash: expect.anything() }),
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: 'OPERATOR', active: true },
      orderBy: { id: 'asc' },
      skip: 5,
      take: 5,
    });
    await expect(adapter.count({ active: true })).resolves.toBe(1);
    await expect(adapter.findById(7)).resolves.toMatchObject({
      id: 7,
      customerId: 2,
    });
    await expect(adapter.findByEmail(user.email)).resolves.toMatchObject({
      id: 7,
      passwordHash: 'secret',
    });
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(adapter.findByEmail('missing')).resolves.toBeNull();
  });

  it('creates, updates, and soft-deletes users', async () => {
    const { prisma, adapter } = harness();
    const data = {
      name: user.name,
      email: user.email,
      passwordHash: user.passwordHash,
      role: 'OPERATOR' as const,
      customerId: 2,
    };
    await expect(adapter.create(data)).resolves.toMatchObject({ id: 7 });
    expect(prisma.user.create).toHaveBeenCalledWith({ data });
    await expect(adapter.update(7, { name: 'Updated' })).resolves.toMatchObject(
      { id: 7 },
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { name: 'Updated' },
    });
    await adapter.softDelete(7);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { active: false },
    });
  });

  it('maps foreign-key failures to a domain error', async () => {
    const { prisma, adapter } = harness();
    const failure = new Prisma.PrismaClientKnownRequestError('foreign key', {
      code: 'P2003',
      clientVersion: '7.10.0',
    });
    prisma.user.create.mockRejectedValueOnce(failure);
    await expect(
      adapter.create({
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        role: 'OPERATOR',
        customerId: 2,
      }),
    ).rejects.toBeInstanceOf(UserCustomerLinkInvalidError);
    prisma.user.update.mockRejectedValueOnce(failure);
    await expect(adapter.update(7, { customerId: 99 })).rejects.toBeInstanceOf(
      UserCustomerLinkInvalidError,
    );
  });
});

describe('PrismaHealthCheckAdapter', () => {
  it('reports a healthy database and an unavailable database', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([1]) };
    const adapter = new PrismaHealthCheckAdapter(
      prisma as unknown as PrismaService,
    );
    await expect(adapter.snapshot()).resolves.toEqual(
      expect.objectContaining({
        database: 'up',
        latencyMs: expect.any(Number),
      }),
    );
    prisma.$queryRaw.mockRejectedValueOnce(new Error('connection lost'));
    await expect(adapter.snapshot()).resolves.toEqual(
      expect.objectContaining({
        database: 'down',
        latencyMs: expect.any(Number),
      }),
    );
  });
});
