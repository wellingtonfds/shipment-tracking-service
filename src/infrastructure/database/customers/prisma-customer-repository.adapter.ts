import { Injectable } from '@nestjs/common';
import { Customer, CustomerProps } from '../../../domain/customers/customer.entity.js';
import { UpdateCustomerData, CustomerRepositoryPort } from '../../../domain/customers/ports/customer-repository.port.js';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaCustomerRepositoryAdapter implements CustomerRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(page: number, limit: number): Promise<Customer[]> {
    const records = await this.prisma.customer.findMany({
      orderBy: { id: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return records.map((record) => this.toEntity(record));
  }

  async count(): Promise<number> {
    return this.prisma.customer.count();
  }

  async findById(id: number): Promise<Customer | null> {
    const record = await this.prisma.customer.findUnique({ where: { id } });
    return record ? this.toEntity(record) : null;
  }

  async findByEmail(email: string): Promise<Customer | null> {
    const record = await this.prisma.customer.findUnique({ where: { email } });
    return record ? this.toEntity(record) : null;
  }

  async create(data: CustomerProps): Promise<Customer> {
    const record = await this.prisma.customer.create({ data });
    return this.toEntity(record);
  }

  async update(id: number, data: UpdateCustomerData): Promise<Customer> {
    const record = await this.prisma.customer.update({ where: { id }, data });
    return this.toEntity(record);
  }

  async delete(id: number): Promise<void> {
    await this.prisma.customer.delete({ where: { id } });
  }

  private toEntity(record: {
    id: number;
    name: string;
    email: string;
    phone: string;
    address: string;
    createdAt: Date;
    updatedAt: Date;
  }): Customer {
    return {
      id: record.id,
      name: record.name,
      email: record.email,
      phone: record.phone,
      address: record.address,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
