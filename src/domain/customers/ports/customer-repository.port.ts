import { Customer, CustomerProps } from '../customer.entity.js';

export interface UpdateCustomerData {
  readonly name?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly address?: string;
}

export interface PaginatedCustomers {
  readonly data: Customer[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface CustomerRepositoryPort {
  findMany(page: number, limit: number): Promise<Customer[]>;
  count(): Promise<number>;
  findById(id: number): Promise<Customer | null>;
  findByEmail(email: string): Promise<Customer | null>;
  create(data: CustomerProps): Promise<Customer>;
  update(id: number, data: UpdateCustomerData): Promise<Customer>;
  delete(id: number): Promise<void>;
}
