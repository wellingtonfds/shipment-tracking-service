import { Injectable } from '@nestjs/common';
import { User, UserRole } from '../../../domain/users/user.entity.js';
import { UserCustomerLinkInvalidError } from '../../../domain/users/user.entity.js';
import { CreateUserData, UpdateUserData, UserListFilters, UserRepositoryPort, UserCredentials } from '../../../domain/users/ports/user-repository.port.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';

interface UserRecord {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  active: boolean;
  customerId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PrismaUserRepositoryAdapter implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(page: number, limit: number, filters: UserListFilters = {}): Promise<User[]> {
    const records = await this.prisma.user.findMany({
      where: this.where(filters),
      orderBy: { id: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return records.map((record) => this.toEntity(record));
  }

  async count(filters: UserListFilters = {}): Promise<number> {
    return this.prisma.user.count({ where: this.where(filters) });
  }

  async findById(id: number): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });
    return record ? this.toEntity(record) : null;
  }

  async findByEmail(email: string): Promise<UserCredentials | null> {
    const record = await this.prisma.user.findUnique({ where: { email } });
    return record ? { ...this.toEntity(record), passwordHash: record.passwordHash } : null;
  }

  async create(data: CreateUserData): Promise<User> {
    try {
      const record = await this.prisma.user.create({ data });
      return this.toEntity(record);
    } catch (error) {
      this.mapForeignKeyError(error);
      throw error;
    }
  }

  async update(id: number, data: UpdateUserData): Promise<User> {
    try {
      const record = await this.prisma.user.update({ where: { id }, data });
      return this.toEntity(record);
    } catch (error) {
      this.mapForeignKeyError(error);
      throw error;
    }
  }

  async softDelete(id: number): Promise<User> {
    const record = await this.prisma.user.update({ where: { id }, data: { active: false } });
    return this.toEntity(record);
  }

  private where(filters: UserListFilters): { role?: string; active?: boolean } {
    return {
      ...(filters.role !== undefined ? { role: filters.role } : {}),
      ...(filters.active !== undefined ? { active: filters.active } : {}),
    };
  }

  private mapForeignKeyError(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new UserCustomerLinkInvalidError('Linked customer does not exist');
    }
  }

  private toEntity(record: UserRecord): User {
    return {
      id: record.id,
      name: record.name,
      email: record.email,
      role: record.role as UserRole,
      active: record.active,
      customerId: record.customerId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
