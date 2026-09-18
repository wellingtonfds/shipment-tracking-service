import { User, UserRole } from '../user.entity.js';

export interface UserListFilters {
  readonly role?: UserRole;
  readonly active?: boolean;
}

export interface CreateUserData {
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly active: boolean;
  readonly customerId: number | null;
}

export interface UpdateUserData {
  readonly name?: string;
  readonly email?: string;
  readonly passwordHash?: string;
  readonly role?: UserRole;
  readonly active?: boolean;
  readonly customerId?: number | null;
}

export interface PaginatedUsers {
  readonly data: User[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface UserCredentials extends User {
  readonly passwordHash: string;
}

export interface UserRepositoryPort {
  findMany(page: number, limit: number, filters?: UserListFilters): Promise<User[]>;
  count(filters?: UserListFilters): Promise<number>;
  findById(id: number): Promise<User | null>;
  findByEmail(email: string): Promise<UserCredentials | null>;
  create(data: CreateUserData): Promise<User>;
  update(id: number, data: UpdateUserData): Promise<User>;
  softDelete(id: number): Promise<User>;
}
