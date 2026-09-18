import { ApiProperty } from '@nestjs/swagger';
import { SHIPMENT_STATUSES, ShipmentWithLocation } from '../../../domain/shipments/shipment.entity.js';

export class ShipmentPresenter {
  @ApiProperty({ type: Number, example: 1, description: 'Unique shipment identifier' })
  id!: number;

  @ApiProperty({ example: 'BR2026-0001', description: 'Unique cargo code' })
  cargoCode!: string;

  @ApiProperty({ enum: [...SHIPMENT_STATUSES], example: 'IN_TRANSIT', description: 'Current status' })
  status!: string;

  @ApiProperty({ example: 'São Paulo', description: 'Origin city' })
  originCity!: string;

  @ApiProperty({ example: 'Brasil', description: 'Origin country' })
  originCountry!: string;

  @ApiProperty({ type: Number, nullable: true, example: -23.5505, description: 'Origin latitude' })
  originLatitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: -46.6333, description: 'Origin longitude' })
  originLongitude!: number | null;

  @ApiProperty({ example: 'Rio de Janeiro', description: 'Destination city' })
  destinationCity!: string;

  @ApiProperty({ example: 'Brasil', description: 'Destination country' })
  destinationCountry!: string;

  @ApiProperty({ type: Number, nullable: true, example: -22.9068, description: 'Destination latitude' })
  destinationLatitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: -43.1729, description: 'Destination longitude' })
  destinationLongitude!: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'Campinas, SP', description: 'Current location text (location of the latest history event)' })
  currentLocationText!: string | null;

  @ApiProperty({ type: Number, nullable: true, example: -22.9056, description: 'Current latitude (location of the latest history event)' })
  currentLatitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: -47.0608, description: 'Current longitude (location of the latest history event)' })
  currentLongitude!: number | null;

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:00:00.000Z', description: 'Departure date' })
  departureDate!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-27T18:00:00.000Z', description: 'Estimated delivery date' })
  estimatedDeliveryDate!: string;

  @ApiProperty({ format: 'date-time', nullable: true, example: null, description: 'Delivery date (set when delivered)' })
  deliveredAt!: string | null;

  @ApiProperty({ type: Number, example: 1, description: 'Owning customer id' })
  customerId!: number;

  @ApiProperty({ type: Number, example: 3, description: 'Responsible operator (handler) id' })
  handledById!: number;

  @ApiProperty({ format: 'date-time', example: '2026-09-18T10:00:00.000Z', description: 'Creation date' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-18T12:00:00.000Z', description: 'Last update date' })
  updatedAt!: string;

  static fromEntity(shipment: ShipmentWithLocation): ShipmentPresenter {
    const presenter = new ShipmentPresenter();
    presenter.id = shipment.id;
    presenter.cargoCode = shipment.cargoCode;
    presenter.status = shipment.status;
    presenter.originCity = shipment.originCity;
    presenter.originCountry = shipment.originCountry;
    presenter.originLatitude = shipment.originLatitude;
    presenter.originLongitude = shipment.originLongitude;
    presenter.destinationCity = shipment.destinationCity;
    presenter.destinationCountry = shipment.destinationCountry;
    presenter.destinationLatitude = shipment.destinationLatitude;
    presenter.destinationLongitude = shipment.destinationLongitude;
    presenter.currentLocationText = shipment.currentLocation?.locationText ?? null;
    presenter.currentLatitude = shipment.currentLocation?.latitude ?? null;
    presenter.currentLongitude = shipment.currentLocation?.longitude ?? null;
    presenter.departureDate = shipment.departureDate.toISOString();
    presenter.estimatedDeliveryDate = shipment.estimatedDeliveryDate.toISOString();
    presenter.deliveredAt = shipment.deliveredAt ? shipment.deliveredAt.toISOString() : null;
    presenter.customerId = shipment.customerId;
    presenter.handledById = shipment.handledById;
    presenter.createdAt = shipment.createdAt.toISOString();
    presenter.updatedAt = shipment.updatedAt.toISOString();
    return presenter;
  }
}

export class ListShipmentsMetaPresenter {
  @ApiProperty({ type: Number, example: 45, description: 'Total shipments' })
  total!: number;

  @ApiProperty({ type: Number, example: 1, description: 'Current page' })
  page!: number;

  @ApiProperty({ type: Number, example: 10, description: 'Items per page' })
  limit!: number;

  @ApiProperty({ type: Number, example: 5, description: 'Total pages' })
  totalPages!: number;
}

export class ListShipmentsPresenter {
  @ApiProperty({ type: [ShipmentPresenter], description: 'Shipments of the page' })
  data!: ShipmentPresenter[];

  @ApiProperty({ type: ListShipmentsMetaPresenter, description: 'Pagination metadata' })
  meta!: ListShipmentsMetaPresenter;

  static fromPaginated(result: { data: ShipmentWithLocation[]; total: number; page: number; limit: number; totalPages: number }): ListShipmentsPresenter {
    const presenter = new ListShipmentsPresenter();
    presenter.data = result.data.map((shipment) => ShipmentPresenter.fromEntity(shipment));
    presenter.meta = new ListShipmentsMetaPresenter();
    presenter.meta.total = result.total;
    presenter.meta.page = result.page;
    presenter.meta.limit = result.limit;
    presenter.meta.totalPages = result.totalPages;
    return presenter;
  }
}
