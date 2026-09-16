import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CREATE_CLIENTE_USE_CASE, DELETE_CLIENTE_USE_CASE, GET_CLIENTE_USE_CASE, LIST_CLIENTES_USE_CASE, UPDATE_CLIENTE_USE_CASE } from '../../../application/ports/tokens.js';
import { CreateClienteUseCase } from '../../../application/use-cases/create-cliente.use-case.js';
import { GetClienteUseCase } from '../../../application/use-cases/get-cliente.use-case.js';
import { ListClientesUseCase } from '../../../application/use-cases/list-clientes.use-case.js';
import { UpdateClienteUseCase } from '../../../application/use-cases/update-cliente.use-case.js';
import { DeleteClienteUseCase } from '../../../application/use-cases/delete-cliente.use-case.js';
import { CreateClienteDto } from './dtos/create-cliente.dto.js';
import { UpdateClienteDto } from './dtos/update-cliente.dto.js';
import { ListClientesQueryDto } from './dtos/list-clientes-query.dto.js';
import { ClientePresenter, ListClientesPresenter } from '../presenters/cliente.presenter.js';
import { ErrorPresenter } from '../presenters/error.presenter.js';

@ApiTags('Clientes')
@ApiResponse({ status: 400, type: ErrorPresenter, description: 'Dados de entrada inválidos (id não numérico, body inválido)' })
@Controller('clientes')
export class ClientesController {
  constructor(
    @Inject(LIST_CLIENTES_USE_CASE)
    private readonly listClientes: ListClientesUseCase,
    @Inject(GET_CLIENTE_USE_CASE)
    private readonly getCliente: GetClienteUseCase,
    @Inject(CREATE_CLIENTE_USE_CASE)
    private readonly createCliente: CreateClienteUseCase,
    @Inject(UPDATE_CLIENTE_USE_CASE)
    private readonly updateCliente: UpdateClienteUseCase,
    @Inject(DELETE_CLIENTE_USE_CASE)
    private readonly deleteCliente: DeleteClienteUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista todos os clientes',
    description: 'Retorna clientes paginados via query params ?page e ?limit (limit máximo: 100).',
  })
  @ApiResponse({ status: 200, type: ListClientesPresenter, description: 'Lista paginada de clientes' })
  async list(@Query() query: ListClientesQueryDto): Promise<ListClientesPresenter> {
    const resultado = await this.listClientes.execute(query.page, query.limit);
    return ListClientesPresenter.fromPaginated(resultado);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retorna detalhes de um cliente específico' })
  @ApiResponse({ status: 200, type: ClientePresenter, description: 'Cliente encontrado' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'Cliente não encontrado' })
  async getById(@Param('id', ParseIntPipe) id: number): Promise<ClientePresenter> {
    const cliente = await this.getCliente.execute(id);
    return ClientePresenter.fromEntity(cliente);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um novo cliente' })
  @ApiResponse({ status: 201, type: ClientePresenter, description: 'Cliente criado' })
  @ApiResponse({ status: 409, type: ErrorPresenter, description: 'Email já cadastrado' })
  async create(@Body() dto: CreateClienteDto): Promise<ClientePresenter> {
    const cliente = await this.createCliente.execute(dto);
    return ClientePresenter.fromEntity(cliente);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza dados de um cliente', description: 'Atualização parcial: envie apenas os campos que deseja alterar.' })
  @ApiResponse({ status: 200, type: ClientePresenter, description: 'Cliente atualizado' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'Cliente não encontrado' })
  @ApiResponse({ status: 409, type: ErrorPresenter, description: 'Email já cadastrado em outro cliente' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClienteDto): Promise<ClientePresenter> {
    const cliente = await this.updateCliente.execute(id, dto);
    return ClientePresenter.fromEntity(cliente);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um cliente' })
  @ApiResponse({ status: 204, description: 'Cliente removido' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'Cliente não encontrado' })
  async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.deleteCliente.execute(id);
  }
}
