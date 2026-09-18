import { ApiProperty } from '@nestjs/swagger';
import { SHIPMENT_STATUSES, ShipmentEvent } from '../../../domain/shipments/shipment.entity.js';

export class ShipmentEventPresenter {
  @ApiProperty({ type: Number, example: 7, description: 'Unique event identifier' })
  id!: number;

  @ApiProperty({ type: Number, example: 1, description: 'Shipment identifier' })
  shipmentId!: number;

  @ApiProperty({ enum: [...SHIPMENT_STATUSES], example: 'IN_TRANSIT', description: 'Status snapshot after the occurrence' })
  status!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-18T12:00:00.000Z', description: 'Occurrence date/time' })
  occurredAt!: string;

  @ApiProperty({ example: 'Campinas, SP', description: 'Occurrence location text' })
  locationText!: string;

  @ApiProperty({ type: Number, nullable: true, example: -22.9056, description: 'Occurrence latitude' })
  latitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: -47.0608, description: 'Occurrence longitude' })
  longitude!: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'Left origin facility', description: 'Optional occurrence notes' })
  notes!: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 3, description: 'Manual entry author id' })
  createdById!: number | null;

  @ApiProperty({ format: 'date-time', example: '2026-09-18T12:00:00.000Z', description: 'Record creation date' })
  createdAt!: string;

  static fromEntity(event: ShipmentEvent): ShipmentEventPresenter {
    const presenter = new ShipmentEventPresenter();
    presenter.id = event.id;
    presenter.shipmentId = event.shipmentId;
    presenter.status = event.status;
    presenter.occurredAt = event.occurredAt.toISOString();
    presenter.locationText = event.locationText;
    presenter.latitude = event.latitude;
    presenter.longitude = event.longitude;
    presenter.notes = event.notes;
    presenter.createdById = event.createdById;
    presenter.createdAt = event.createdAt.toISOString();
    return presenter;
  }
}

export class ListShipmentEventsMetaPresenter {
  @ApiProperty({ type: Number, example: 120, description: 'Total history records' })
  total!: number;

  @ApiProperty({ type: Number, example: 1, description: 'Current page' })
  page!: number;

  @ApiProperty({ type: Number, example: 10, description: 'Items per page' })
  limit!: number;

  @ApiProperty({ type: Number, example: 12, description: 'Total pages' })
  totalPages!: number;
}

export class ListShipmentEventsPresenter {
  @ApiProperty({ type: [ShipmentEventPresenter], description: 'History records of the page (most recent first)' })
  data!: ShipmentEventPresenter[];

  @ApiProperty({ type: ListShipmentEventsMetaPresenter, description: 'Pagination metadata' })
  meta!: ListShipmentEventsMetaPresenter;

  static fromPaginated(result: { data: ShipmentEvent[]; total: number; page: number; limit: number; totalPages: number }): ListShipmentEventsPresenter {
    const presenter = new ListShipmentEventsPresenter();
    presenter.data = result.data.map((event) => ShipmentEventPresenter.fromEntity(event));
    presenter.meta = new ListShipmentEventsMetaPresenter();
    presenter.meta.total = result.total;
    presenter.meta.page = result.page;
    presenter.meta.limit = result.limit;
    presenter.meta.totalPages = result.totalPages;
    return presenter;
  }
}
