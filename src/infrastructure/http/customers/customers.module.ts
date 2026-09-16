import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller.js';
import { CreateCustomerUseCase } from '../../../application/customers/use-cases/create-customer.use-case.js';
import { GetCustomerUseCase } from '../../../application/customers/use-cases/get-customer.use-case.js';
import { ListCustomersUseCase } from '../../../application/customers/use-cases/list-customers.use-case.js';
import { UpdateCustomerUseCase } from '../../../application/customers/use-cases/update-customer.use-case.js';
import { DeleteCustomerUseCase } from '../../../application/customers/use-cases/delete-customer.use-case.js';
import { CUSTOMER_REPOSITORY, CREATE_CUSTOMER_USE_CASE, DELETE_CUSTOMER_USE_CASE, GET_CUSTOMER_USE_CASE, LIST_CUSTOMERS_USE_CASE, UPDATE_CUSTOMER_USE_CASE } from '../../../application/customers/customer.tokens.js';
import { PrismaCustomerRepositoryAdapter } from '../../database/customers/prisma-customer-repository.adapter.js';

@Module({
  controllers: [CustomersController],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: PrismaCustomerRepositoryAdapter },
    { provide: LIST_CUSTOMERS_USE_CASE, useFactory: (repo) => new ListCustomersUseCase(repo), inject: [CUSTOMER_REPOSITORY] },
    { provide: GET_CUSTOMER_USE_CASE, useFactory: (repo) => new GetCustomerUseCase(repo), inject: [CUSTOMER_REPOSITORY] },
    { provide: CREATE_CUSTOMER_USE_CASE, useFactory: (repo) => new CreateCustomerUseCase(repo), inject: [CUSTOMER_REPOSITORY] },
    { provide: UPDATE_CUSTOMER_USE_CASE, useFactory: (repo) => new UpdateCustomerUseCase(repo), inject: [CUSTOMER_REPOSITORY] },
    { provide: DELETE_CUSTOMER_USE_CASE, useFactory: (repo) => new DeleteCustomerUseCase(repo), inject: [CUSTOMER_REPOSITORY] },
  ],
})
export class CustomersModule {}
