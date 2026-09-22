import { Module } from '@nestjs/common';
import type { CustomerRepositoryPort } from '../../../domain/customers/ports/customer-repository.port.js';
import type { ShipmentRepositoryPort } from '../../../domain/shipments/ports/shipment-repository.port.js';
import type { UserRepositoryPort } from '../../../domain/users/ports/user-repository.port.js';
import { CUSTOMER_REPOSITORY } from '../../../application/customers/customer.tokens.js';
import {
  ADD_SHIPMENT_EVENT_USE_CASE,
  CANCEL_SHIPMENT_USE_CASE,
  CREATE_SHIPMENT_USE_CASE,
  GET_SHIPMENT_HISTORY_USE_CASE,
  GET_SHIPMENT_USE_CASE,
  LIST_SHIPMENTS_BY_STATUS_USE_CASE,
  LIST_SHIPMENTS_USE_CASE,
  LIST_SHIPMENT_EVENTS_USE_CASE,
  MARK_SHIPMENT_DELIVERED_USE_CASE,
  SHIPMENT_REPOSITORY,
  UPDATE_SHIPMENT_LOCATION_USE_CASE,
  UPDATE_SHIPMENT_STATUS_USE_CASE,
} from '../../../application/shipments/shipment.tokens.js';
import { USER_REPOSITORY } from '../../../application/users/user.tokens.js';
import { AddShipmentEventUseCase } from '../../../application/shipments/use-cases/add-shipment-event.use-case.js';
import { CancelShipmentUseCase } from '../../../application/shipments/use-cases/cancel-shipment.use-case.js';
import { CreateShipmentUseCase } from '../../../application/shipments/use-cases/create-shipment.use-case.js';
import { GetShipmentHistoryUseCase } from '../../../application/shipments/use-cases/get-shipment-history.use-case.js';
import { GetShipmentUseCase } from '../../../application/shipments/use-cases/get-shipment.use-case.js';
import { ListShipmentEventsUseCase } from '../../../application/shipments/use-cases/list-shipment-events.use-case.js';
import { ListShipmentsByStatusUseCase } from '../../../application/shipments/use-cases/list-shipments-by-status.use-case.js';
import { ListShipmentsUseCase } from '../../../application/shipments/use-cases/list-shipments.use-case.js';
import { MarkShipmentDeliveredUseCase } from '../../../application/shipments/use-cases/mark-shipment-delivered.use-case.js';
import { UpdateShipmentLocationUseCase } from '../../../application/shipments/use-cases/update-shipment-location.use-case.js';
import { UpdateShipmentStatusUseCase } from '../../../application/shipments/use-cases/update-shipment-status.use-case.js';
import { PrismaShipmentRepositoryAdapter } from '../../database/shipments/prisma-shipment-repository.adapter.js';
import { TrackingOutboxWorkerService } from '../../database/shipments/tracking-outbox-worker.service.js';
import { PrismaUserRepositoryAdapter } from '../../database/users/prisma-user-repository.adapter.js';
import { CustomersModule } from '../customers/customers.module.js';
import { HistoricoController } from './historico.controller.js';
import { TrackingController } from './tracking.controller.js';

@Module({
  imports: [CustomersModule],
  controllers: [TrackingController, HistoricoController],
  providers: [
    TrackingOutboxWorkerService,
    { provide: SHIPMENT_REPOSITORY, useClass: PrismaShipmentRepositoryAdapter },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepositoryAdapter },
    {
      provide: CREATE_SHIPMENT_USE_CASE,
      useFactory: (
        shipments: ShipmentRepositoryPort,
        customers: CustomerRepositoryPort,
        users: UserRepositoryPort,
      ) => new CreateShipmentUseCase(shipments, customers, users),
      inject: [SHIPMENT_REPOSITORY, CUSTOMER_REPOSITORY, USER_REPOSITORY],
    },
    {
      provide: LIST_SHIPMENTS_USE_CASE,
      useFactory: (shipments: ShipmentRepositoryPort) =>
        new ListShipmentsUseCase(shipments),
      inject: [SHIPMENT_REPOSITORY],
    },
    {
      provide: LIST_SHIPMENTS_BY_STATUS_USE_CASE,
      useFactory: (list: ListShipmentsUseCase) =>
        new ListShipmentsByStatusUseCase(list),
      inject: [LIST_SHIPMENTS_USE_CASE],
    },
    {
      provide: GET_SHIPMENT_USE_CASE,
      useFactory: (shipments: ShipmentRepositoryPort) =>
        new GetShipmentUseCase(shipments),
      inject: [SHIPMENT_REPOSITORY],
    },
    {
      provide: UPDATE_SHIPMENT_STATUS_USE_CASE,
      useFactory: (shipments: ShipmentRepositoryPort) =>
        new UpdateShipmentStatusUseCase(shipments),
      inject: [SHIPMENT_REPOSITORY],
    },
    {
      provide: UPDATE_SHIPMENT_LOCATION_USE_CASE,
      useFactory: (shipments: ShipmentRepositoryPort) =>
        new UpdateShipmentLocationUseCase(shipments),
      inject: [SHIPMENT_REPOSITORY],
    },
    {
      provide: MARK_SHIPMENT_DELIVERED_USE_CASE,
      useFactory: (shipments: ShipmentRepositoryPort) =>
        new MarkShipmentDeliveredUseCase(shipments),
      inject: [SHIPMENT_REPOSITORY],
    },
    {
      provide: CANCEL_SHIPMENT_USE_CASE,
      useFactory: (shipments: ShipmentRepositoryPort) =>
        new CancelShipmentUseCase(shipments),
      inject: [SHIPMENT_REPOSITORY],
    },
    {
      provide: GET_SHIPMENT_HISTORY_USE_CASE,
      useFactory: (shipments: ShipmentRepositoryPort) =>
        new GetShipmentHistoryUseCase(shipments),
      inject: [SHIPMENT_REPOSITORY],
    },
    {
      provide: LIST_SHIPMENT_EVENTS_USE_CASE,
      useFactory: (shipments: ShipmentRepositoryPort) =>
        new ListShipmentEventsUseCase(shipments),
      inject: [SHIPMENT_REPOSITORY],
    },
    {
      provide: ADD_SHIPMENT_EVENT_USE_CASE,
      useFactory: (shipments: ShipmentRepositoryPort) =>
        new AddShipmentEventUseCase(shipments),
      inject: [SHIPMENT_REPOSITORY],
    },
  ],
})
export class TrackingModule {}
