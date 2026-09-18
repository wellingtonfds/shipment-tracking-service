import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CREATE_CUSTOMER_USE_CASE, DELETE_CUSTOMER_USE_CASE, GET_CUSTOMER_USE_CASE, LIST_CUSTOMERS_USE_CASE, UPDATE_CUSTOMER_USE_CASE } from '../../../application/customers/customer.tokens.js';
import { CreateCustomerUseCase } from '../../../application/customers/use-cases/create-customer.use-case.js';
import { GetCustomerUseCase } from '../../../application/customers/use-cases/get-customer.use-case.js';
import { ListCustomersUseCase } from '../../../application/customers/use-cases/list-customers.use-case.js';
import { UpdateCustomerUseCase } from '../../../application/customers/use-cases/update-customer.use-case.js';
import { DeleteCustomerUseCase } from '../../../application/customers/use-cases/delete-customer.use-case.js';
import { CreateCustomerDto } from './dtos/create-customer.dto.js';
import { UpdateCustomerDto } from './dtos/update-customer.dto.js';
import { ListCustomersQueryDto } from './dtos/list-customers-query.dto.js';
import { CustomerPresenter, ListCustomersPresenter } from './customer.presenter.js';
import { ErrorPresenter } from '../shared/presenters/error.presenter.js';
import { Public } from '../shared/guards/public.decorator.js';

@ApiTags('Customers')
@ApiResponse({ status: 400, type: ErrorPresenter, description: 'Invalid input (non-numeric id, invalid body)' })
@Public()
@Controller('customers')
export class CustomersController {
  constructor(
    @Inject(LIST_CUSTOMERS_USE_CASE)
    private readonly listCustomers: ListCustomersUseCase,
    @Inject(GET_CUSTOMER_USE_CASE)
    private readonly getCustomer: GetCustomerUseCase,
    @Inject(CREATE_CUSTOMER_USE_CASE)
    private readonly createCustomer: CreateCustomerUseCase,
    @Inject(UPDATE_CUSTOMER_USE_CASE)
    private readonly updateCustomer: UpdateCustomerUseCase,
    @Inject(DELETE_CUSTOMER_USE_CASE)
    private readonly deleteCustomer: DeleteCustomerUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all customers',
    description: 'Returns paginated customers via query params ?page and ?limit (max limit: 100).',
  })
  @ApiResponse({ status: 200, type: ListCustomersPresenter, description: 'Paginated list of customers' })
  async list(@Query() query: ListCustomersQueryDto): Promise<ListCustomersPresenter> {
    const result = await this.listCustomers.execute(query.page, query.limit);
    return ListCustomersPresenter.fromPaginated(result);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Return details of a specific customer' })
  @ApiResponse({ status: 200, type: CustomerPresenter, description: 'Customer found' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'Customer not found' })
  async getById(@Param('id', ParseIntPipe) id: number): Promise<CustomerPresenter> {
    const customer = await this.getCustomer.execute(id);
    return CustomerPresenter.fromEntity(customer);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({ status: 201, type: CustomerPresenter, description: 'Customer created' })
  @ApiResponse({ status: 409, type: ErrorPresenter, description: 'Email already registered' })
  async create(@Body() dto: CreateCustomerDto): Promise<CustomerPresenter> {
    const customer = await this.createCustomer.execute(dto);
    return CustomerPresenter.fromEntity(customer);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update customer data', description: 'Partial update: send only the fields you want to change.' })
  @ApiResponse({ status: 200, type: CustomerPresenter, description: 'Customer updated' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'Customer not found' })
  @ApiResponse({ status: 409, type: ErrorPresenter, description: 'Email already registered by another customer' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto): Promise<CustomerPresenter> {
    const customer = await this.updateCustomer.execute(id, dto);
    return CustomerPresenter.fromEntity(customer);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a customer' })
  @ApiResponse({ status: 204, description: 'Customer removed' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'Customer not found' })
  async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.deleteCustomer.execute(id);
  }
}
