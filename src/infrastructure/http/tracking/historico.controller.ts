import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthPayload } from '../../../application/users/ports/token-service.port.js';
import { ADD_SHIPMENT_EVENT_USE_CASE, LIST_SHIPMENT_EVENTS_USE_CASE } from '../../../application/shipments/shipment.tokens.js';
import { AddShipmentEventUseCase } from '../../../application/shipments/use-cases/add-shipment-event.use-case.js';
import { ListShipmentEventsUseCase } from '../../../application/shipments/use-cases/list-shipment-events.use-case.js';
import { Roles } from '../shared/guards/roles.decorator.js';
import { CurrentUser } from '../shared/guards/current-user.decorator.js';
import { ErrorPresenter } from '../shared/presenters/error.presenter.js';
import { AddShipmentEventDto } from './dtos/add-shipment-event.dto.js';
import { ListShipmentEventsQueryDto } from './dtos/list-shipment-events-query.dto.js';
import { ListShipmentEventsPresenter, ShipmentEventPresenter } from './shipment-event.presenter.js';

// Routes kept in Portuguese (/historico) per the tracking spec — code identifiers
// stay in English (English-only code); see docs/TRACKING_DEFINITION.md.
@ApiTags('Historico')
@ApiBearerAuth()
@ApiResponse({ status: 400, type: ErrorPresenter, description: 'Invalid input' })
@ApiResponse({ status: 401, type: ErrorPresenter, description: 'Missing, invalid or expired token' })
@ApiResponse({ status: 403, type: ErrorPresenter, description: 'Restricted to ADMINISTRATOR' })
@Roles('ADMINISTRATOR')
@Controller('historico')
export class HistoricoController {
  constructor(
    @Inject(LIST_SHIPMENT_EVENTS_USE_CASE)
    private readonly listEvents: ListShipmentEventsUseCase,
    @Inject(ADD_SHIPMENT_EVENT_USE_CASE)
    private readonly addEvent: AddShipmentEventUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all history records',
    description: 'Restricted to ADMINISTRATOR. Requires a time window (?inicio and/or ?fim) and paginated results (?page, ?limit max 100).',
  })
  @ApiResponse({ status: 200, type: ListShipmentEventsPresenter, description: 'Paginated history records (most recent first)' })
  @ApiResponse({ status: 422, type: ErrorPresenter, description: 'Missing time window' })
  async list(@CurrentUser() user: AuthPayload, @Query() query: ListShipmentEventsQueryDto): Promise<ListShipmentEventsPresenter> {
    const result = await this.listEvents.execute({
      page: query.page,
      limit: query.limit,
      status: query.status,
      shipmentId: query.idCarga ?? null,
      ...(query.inicio !== undefined ? { occurredFrom: new Date(query.inicio) } : {}),
      ...(query.fim !== undefined ? { occurredTo: new Date(query.fim) } : {}),
      principal: user,
    });
    return ListShipmentEventsPresenter.fromPaginated(result);
  }

  @Post(':codigoCarga')
  @ApiOperation({
    summary: 'Add a manual occurrence to a shipment',
    description: 'Internal/administrative use. Backdated occurredAt allowed; records history only (never changes the shipment status).',
  })
  @ApiResponse({ status: 201, type: ShipmentEventPresenter, description: 'Occurrence recorded' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'Shipment not found' })
  @ApiResponse({ status: 422, type: ErrorPresenter, description: 'Invalid status or occurredAt' })
  async add(@CurrentUser() user: AuthPayload, @Param('codigoCarga') cargoCode: string, @Body() dto: AddShipmentEventDto): Promise<ShipmentEventPresenter> {
    const event = await this.addEvent.execute({
      cargoCode,
      status: dto.status ?? null,
      locationText: dto.locationText,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      notes: dto.notes ?? null,
      occurredAt: dto.occurredAt,
      principal: user,
    });
    return ShipmentEventPresenter.fromEntity(event);
  }
}
