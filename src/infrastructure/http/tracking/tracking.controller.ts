import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthPayload } from '../../../application/users/ports/token-service.port.js';
import { SHIPMENT_STATUSES } from '../../../domain/shipments/shipment.entity.js';
import {
  CANCEL_SHIPMENT_USE_CASE,
  CREATE_SHIPMENT_USE_CASE,
  GET_SHIPMENT_HISTORY_USE_CASE,
  GET_SHIPMENT_USE_CASE,
  LIST_SHIPMENTS_BY_STATUS_USE_CASE,
  LIST_SHIPMENTS_USE_CASE,
  MARK_SHIPMENT_DELIVERED_USE_CASE,
  UPDATE_SHIPMENT_LOCATION_USE_CASE,
  UPDATE_SHIPMENT_STATUS_USE_CASE,
} from '../../../application/shipments/shipment.tokens.js';
import { CancelShipmentUseCase } from '../../../application/shipments/use-cases/cancel-shipment.use-case.js';
import { CreateShipmentUseCase } from '../../../application/shipments/use-cases/create-shipment.use-case.js';
import { GetShipmentHistoryUseCase } from '../../../application/shipments/use-cases/get-shipment-history.use-case.js';
import { GetShipmentUseCase } from '../../../application/shipments/use-cases/get-shipment.use-case.js';
import { ListShipmentsByStatusUseCase } from '../../../application/shipments/use-cases/list-shipments-by-status.use-case.js';
import { ListShipmentsUseCase } from '../../../application/shipments/use-cases/list-shipments.use-case.js';
import { MarkShipmentDeliveredUseCase } from '../../../application/shipments/use-cases/mark-shipment-delivered.use-case.js';
import { UpdateShipmentLocationUseCase } from '../../../application/shipments/use-cases/update-shipment-location.use-case.js';
import { UpdateShipmentStatusUseCase } from '../../../application/shipments/use-cases/update-shipment-status.use-case.js';
import { Roles } from '../shared/guards/roles.decorator.js';
import { CurrentUser } from '../shared/guards/current-user.decorator.js';
import { ErrorPresenter } from '../shared/presenters/error.presenter.js';
import { CreateShipmentDto } from './dtos/create-shipment.dto.js';
import { ListShipmentHistoryQueryDto } from './dtos/list-shipment-history-query.dto.js';
import { ListShipmentsQueryDto } from './dtos/list-shipments-query.dto.js';
import { MarkShipmentDeliveredDto } from './dtos/mark-shipment-delivered.dto.js';
import { UpdateShipmentLocationDto } from './dtos/update-shipment-location.dto.js';
import { UpdateShipmentStatusDto } from './dtos/update-shipment-status.dto.js';
import { ListShipmentEventsPresenter } from './shipment-event.presenter.js';
import { ListShipmentsPresenter, ShipmentPresenter } from './shipment.presenter.js';

// Routes kept in Portuguese (/tracking, /historico, {codigoCarga}) per the tracking
// spec — code identifiers stay in English (English-only code);
// see docs/TRACKING_DEFINITION.md for the glossary.
@ApiTags('Tracking')
@ApiBearerAuth()
@ApiResponse({ status: 400, type: ErrorPresenter, description: 'Invalid input' })
@ApiResponse({ status: 401, type: ErrorPresenter, description: 'Missing, invalid or expired token' })
@ApiResponse({ status: 403, type: ErrorPresenter, description: 'Authenticated user lacks the required profile or customer scope' })
@Roles('ADMINISTRATOR', 'OPERATOR', 'CUSTOMER')
@Controller('tracking')
export class TrackingController {
  constructor(
    @Inject(CREATE_SHIPMENT_USE_CASE)
    private readonly createShipment: CreateShipmentUseCase,
    @Inject(LIST_SHIPMENTS_USE_CASE)
    private readonly listShipments: ListShipmentsUseCase,
    @Inject(LIST_SHIPMENTS_BY_STATUS_USE_CASE)
    private readonly listByStatus: ListShipmentsByStatusUseCase,
    @Inject(GET_SHIPMENT_USE_CASE)
    private readonly getShipment: GetShipmentUseCase,
    @Inject(UPDATE_SHIPMENT_STATUS_USE_CASE)
    private readonly updateStatus: UpdateShipmentStatusUseCase,
    @Inject(UPDATE_SHIPMENT_LOCATION_USE_CASE)
    private readonly updateLocation: UpdateShipmentLocationUseCase,
    @Inject(MARK_SHIPMENT_DELIVERED_USE_CASE)
    private readonly markDelivered: MarkShipmentDeliveredUseCase,
    @Inject(CANCEL_SHIPMENT_USE_CASE)
    private readonly cancelShipment: CancelShipmentUseCase,
    @Inject(GET_SHIPMENT_HISTORY_USE_CASE)
    private readonly getHistory: GetShipmentHistoryUseCase,
  ) {}

  @Post()
  @Roles('ADMINISTRATOR', 'OPERATOR')
  @ApiOperation({
    summary: 'Register a new shipment',
    description: 'OPERATOR: customer and handler are derived from the token (customerId/handledById in the body are ignored). ADMINISTRATOR: customerId and handledById are required.',
  })
  @ApiResponse({ status: 201, type: ShipmentPresenter, description: 'Shipment created' })
  @ApiResponse({ status: 409, type: ErrorPresenter, description: 'Cargo code already in use' })
  @ApiResponse({ status: 422, type: ErrorPresenter, description: 'Invalid dates or handler' })
  async create(@CurrentUser() user: AuthPayload, @Body() dto: CreateShipmentDto): Promise<ShipmentPresenter> {
    const shipment = await this.createShipment.execute({
      cargoCode: dto.cargoCode,
      originCity: dto.originCity,
      originCountry: dto.originCountry,
      originLatitude: dto.originLatitude ?? null,
      originLongitude: dto.originLongitude ?? null,
      destinationCity: dto.destinationCity,
      destinationCountry: dto.destinationCountry,
      destinationLatitude: dto.destinationLatitude ?? null,
      destinationLongitude: dto.destinationLongitude ?? null,
      departureDate: dto.departureDate,
      estimatedDeliveryDate: dto.estimatedDeliveryDate,
      customerId: dto.customerId ?? null,
      handledById: dto.handledById ?? null,
      principal: user,
    });
    return ShipmentPresenter.fromEntity(shipment);
  }

  @Get()
  @ApiOperation({
    summary: 'List shipments',
    description: 'Paginated (?page, ?limit max 100) with combinable filters ?status, ?idCliente, ?idOperador, departure/delivery windows and sorting. OPERATOR and CUSTOMER only see their own customer shipments.',
  })
  @ApiResponse({ status: 200, type: ListShipmentsPresenter, description: 'Paginated list of shipments' })
  async list(@CurrentUser() user: AuthPayload, @Query() query: ListShipmentsQueryDto): Promise<ListShipmentsPresenter> {
    const result = await this.listShipments.execute(this.toListRequest(user, query));
    return ListShipmentsPresenter.fromPaginated(result);
  }

  // Declared before ':codigoCarga' so the static segment is matched first.
  @Get('status/:status')
  @ApiOperation({
    summary: 'List shipments by status',
    description: 'Shortcut for GET /tracking?status=. Same scoping and pagination rules.',
  })
  @ApiParam({ name: 'status', enum: [...SHIPMENT_STATUSES], description: 'Current status' })
  @ApiResponse({ status: 200, type: ListShipmentsPresenter, description: 'Paginated list of shipments with the given status' })
  @ApiResponse({ status: 422, type: ErrorPresenter, description: 'Unknown status' })
  async listByStatusPath(@CurrentUser() user: AuthPayload, @Param('status') status: string, @Query() query: ListShipmentsQueryDto): Promise<ListShipmentsPresenter> {
    const result = await this.listByStatus.execute(status, this.toListRequest(user, query));
    return ListShipmentsPresenter.fromPaginated(result);
  }

  @Get(':codigoCarga')
  @ApiOperation({ summary: 'Return shipment details', description: 'Full shipment details with the current status. Scoped to the customer of OPERATOR/CUSTOMER profiles.' })
  @ApiResponse({ status: 200, type: ShipmentPresenter, description: 'Shipment found' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'Shipment not found' })
  async getByCode(@CurrentUser() user: AuthPayload, @Param('codigoCarga') cargoCode: string): Promise<ShipmentPresenter> {
    const shipment = await this.getShipment.execute(cargoCode, user);
    return ShipmentPresenter.fromEntity(shipment);
  }

  @Get(':codigoCarga/historico')
  @ApiOperation({ summary: 'Return the shipment movement history', description: 'Events in reverse chronological order (most recent first). Scoped to the customer of OPERATOR/CUSTOMER profiles.' })
  @ApiResponse({ status: 200, type: ListShipmentEventsPresenter, description: 'Paginated shipment history' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'Shipment not found' })
  async history(@CurrentUser() user: AuthPayload, @Param('codigoCarga') cargoCode: string, @Query() query: ListShipmentHistoryQueryDto): Promise<ListShipmentEventsPresenter> {
    const result = await this.getHistory.execute({ cargoCode, page: query.page, limit: query.limit, principal: user });
    return ListShipmentEventsPresenter.fromPaginated(result);
  }

  @Put(':codigoCarga/status')
  @Roles('ADMINISTRATOR', 'OPERATOR')
  @ApiOperation({
    summary: 'Update shipment status and current location',
    description: 'Single action that also records history (atomic shipment update + event). Follows the linear flow CREATED -> IN_TRANSIT -> TRANSFERRED -> DELIVERED.',
  })
  @ApiResponse({ status: 200, type: ShipmentPresenter, description: 'Shipment updated' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'Shipment not found' })
  @ApiResponse({ status: 422, type: ErrorPresenter, description: 'Invalid status transition' })
  @ApiResponse({ status: 409, type: ErrorPresenter, description: 'Concurrent modification; retry the operation' })
  async updateStatusRoute(
    @CurrentUser() user: AuthPayload,
    @Param('codigoCarga') cargoCode: string,
    @Body() dto: UpdateShipmentStatusDto,
  ): Promise<ShipmentPresenter> {
    const shipment = await this.updateStatus.execute({
      cargoCode,
      status: dto.status,
      locationText: dto.locationText,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      notes: dto.notes ?? null,
      principal: user,
    });
    return ShipmentPresenter.fromEntity(shipment);
  }

  @Put(':codigoCarga/localizacao')
  @Roles('ADMINISTRATOR', 'OPERATOR')
  @ApiOperation({
    summary: 'Update only the current shipment location',
    description: 'Basic location update (text and/or coordinates, no external geocoding). Also records a movement event with the unchanged status.',
  })
  @ApiResponse({ status: 200, type: ShipmentPresenter, description: 'Location updated' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'Shipment not found' })
  @ApiResponse({ status: 409, type: ErrorPresenter, description: 'Concurrent modification; retry the operation' })
  async updateLocationRoute(
    @CurrentUser() user: AuthPayload,
    @Param('codigoCarga') cargoCode: string,
    @Body() dto: UpdateShipmentLocationDto,
  ): Promise<ShipmentPresenter> {
    const shipment = await this.updateLocation.execute({
      cargoCode,
      locationText: dto.locationText,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      notes: dto.notes ?? null,
      principal: user,
    });
    return ShipmentPresenter.fromEntity(shipment);
  }

  @Put(':codigoCarga/entrega')
  @Roles('ADMINISTRATOR', 'OPERATOR')
  @ApiOperation({
    summary: 'Mark the shipment as delivered',
    description: 'Sets DELIVERED + deliveredAt from any non-terminal status and records the final history event.',
  })
  @ApiResponse({ status: 200, type: ShipmentPresenter, description: 'Shipment delivered' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'Shipment not found' })
  @ApiResponse({ status: 422, type: ErrorPresenter, description: 'Shipment already delivered' })
  @ApiResponse({ status: 409, type: ErrorPresenter, description: 'Concurrent modification; retry the operation' })
  async deliver(
    @CurrentUser() user: AuthPayload,
    @Param('codigoCarga') cargoCode: string,
    @Body() dto: MarkShipmentDeliveredDto,
  ): Promise<ShipmentPresenter> {
    const shipment = await this.markDelivered.execute({
      cargoCode,
      locationText: dto.locationText ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      notes: dto.notes ?? null,
      principal: user,
    });
    return ShipmentPresenter.fromEntity(shipment);
  }

  @Delete(':codigoCarga')
  @Roles('ADMINISTRATOR', 'OPERATOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancel/remove a shipment',
    description: 'Hard delete: removing the shipment also removes its history (cascade). Scoped to the customer of OPERATOR profiles.',
  })
  @ApiResponse({ status: 204, description: 'Shipment removed' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'Shipment not found' })
  async remove(@CurrentUser() user: AuthPayload, @Param('codigoCarga') cargoCode: string): Promise<void> {
    await this.cancelShipment.execute(cargoCode, user);
  }
  private toListRequest(
    user: AuthPayload,
    query: ListShipmentsQueryDto,
  ): {
    page?: number;
    limit?: number;
    orderBy?: string;
    order?: string;
    status?: string;
    customerId?: number | null;
    handledById?: number | null;
    departureFrom?: Date;
    departureTo?: Date;
    estimatedFrom?: Date;
    estimatedTo?: Date;
    principal: AuthPayload;
  } {
    return {
      page: query.page,
      limit: query.limit,
      orderBy: query.orderBy,
      order: query.order,
      status: query.status,
      customerId: query.idCliente ?? null,
      handledById: query.idOperador ?? null,
      ...(query.embarqueDe !== undefined ? { departureFrom: new Date(query.embarqueDe) } : {}),
      ...(query.embarqueAte !== undefined ? { departureTo: new Date(query.embarqueAte) } : {}),
      ...(query.entregaDe !== undefined ? { estimatedFrom: new Date(query.entregaDe) } : {}),
      ...(query.entregaAte !== undefined ? { estimatedTo: new Date(query.entregaAte) } : {}),
      principal: user,
    };
  }
}
