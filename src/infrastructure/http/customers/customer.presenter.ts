import { ApiProperty } from '@nestjs/swagger';
import { Customer } from '../../../domain/customers/customer.entity.js';

export class CustomerPresenter {
  @ApiProperty({ type: Number, example: 1, description: 'Unique customer identifier' })
  id!: number;

  @ApiProperty({ example: 'John Doe', description: 'Customer full name' })
  name!: string;

  @ApiProperty({ example: 'john.doe@example.com', description: 'Customer email (unique)', format: 'email' })
  email!: string;

  @ApiProperty({ example: '(11) 98888-7777', description: 'Customer phone number' })
  phone!: string;

  @ApiProperty({ example: 'Paulista Ave, 1000 - apt 42', description: 'Customer address' })
  address!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-16T20:30:00.000Z', description: 'Creation date' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-16T20:30:00.000Z', description: 'Last update date' })
  updatedAt!: string;

  static fromEntity(customer: Customer): CustomerPresenter {
    const presenter = new CustomerPresenter();
    presenter.id = customer.id;
    presenter.name = customer.name;
    presenter.email = customer.email;
    presenter.phone = customer.phone;
    presenter.address = customer.address;
    presenter.createdAt = customer.createdAt.toISOString();
    presenter.updatedAt = customer.updatedAt.toISOString();
    return presenter;
  }
}

export class ListCustomersMetaPresenter {
  @ApiProperty({ type: Number, example: 15, description: 'Total customers' })
  total!: number;

  @ApiProperty({ type: Number, example: 1, description: 'Current page' })
  page!: number;

  @ApiProperty({ type: Number, example: 10, description: 'Items per page' })
  limit!: number;

  @ApiProperty({ type: Number, example: 2, description: 'Total pages' })
  totalPages!: number;
}

export class ListCustomersPresenter {
  @ApiProperty({ type: [CustomerPresenter], description: 'Customers of the page' })
  data!: CustomerPresenter[];

  @ApiProperty({ type: ListCustomersMetaPresenter, description: 'Pagination metadata' })
  meta!: ListCustomersMetaPresenter;

  static fromPaginated(result: { data: Customer[]; total: number; page: number; limit: number; totalPages: number }): ListCustomersPresenter {
    const presenter = new ListCustomersPresenter();
    presenter.data = result.data.map((customer) => CustomerPresenter.fromEntity(customer));
    presenter.meta = new ListCustomersMetaPresenter();
    presenter.meta.total = result.total;
    presenter.meta.page = result.page;
    presenter.meta.limit = result.limit;
    presenter.meta.totalPages = result.totalPages;
    return presenter;
  }
}
