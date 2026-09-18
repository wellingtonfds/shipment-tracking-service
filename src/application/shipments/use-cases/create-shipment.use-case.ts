import { CreateShipmentInput, InvalidShipmentError, ShipmentWithLocation, TenantPrincipal, validateCreateShipment } from '../../../domain/shipments/shipment.entity.js';
import { CustomerScopeMissingError } from '../../../domain/shipments/errors/customer-scope-missing.error.js';
import { ShipmentCargoCodeInUseError } from '../../../domain/shipments/errors/shipment-cargo-code-in-use.error.js';
import { ShipmentHandlerInactiveError } from '../../../domain/shipments/errors/shipment-handler-inactive.error.js';
import { ShipmentHandlerRequiredError } from '../../../domain/shipments/errors/shipment-handler-required.error.js';
import { ShipmentRepositoryPort } from '../../../domain/shipments/ports/shipment-repository.port.js';
import { AccessDeniedError } from '../../../domain/users/errors/access-denied.error.js';
import { UserNotFoundError } from '../../../domain/users/errors/user-not-found.error.js';
import { UserRepositoryPort } from '../../../domain/users/ports/user-repository.port.js';
import { CustomerNotFoundError } from '../../../domain/customers/errors/customer-not-found.error.js';
import { CustomerRepositoryPort } from '../../../domain/customers/ports/customer-repository.port.js';

export interface CreateShipmentRequest extends CreateShipmentInput {
  /** Only meaningful for ADMINISTRATOR; OPERATOR input here is ignored (derived from the token). */
  readonly customerId?: number | null;
  /** Only meaningful for ADMINISTRATOR; OPERATOR input here is ignored (handled by self). */
  readonly handledById?: number | null;
  readonly principal: TenantPrincipal;
}

export class CreateShipmentUseCase {
  constructor(
    private readonly shipments: ShipmentRepositoryPort,
    private readonly customers: CustomerRepositoryPort,
    private readonly users: UserRepositoryPort,
  ) {}

  async execute(request: CreateShipmentRequest): Promise<ShipmentWithLocation> {
    const { principal, customerId, handledById, ...shipmentInput } = request;
    const data = validateCreateShipment(shipmentInput);
    const ownership = await this.resolveOwnership(principal, customerId, handledById);

    const existing = await this.shipments.findByCargoCode(data.cargoCode);
    if (existing) {
      throw new ShipmentCargoCodeInUseError(data.cargoCode);
    }

    const created = await this.shipments.create({ ...data, customerId: ownership.customerId, handledById: ownership.handledById });
    // The initial location is the origin, recorded in the CREATED event.
    return {
      ...created,
      currentLocation: {
        locationText: `${created.originCity}, ${created.originCountry}`,
        latitude: created.originLatitude,
        longitude: created.originLongitude,
      },
    };
  }

  private async resolveOwnership(principal: TenantPrincipal, customerId: number | null | undefined, handledById: number | null | undefined): Promise<{ customerId: number; handledById: number }> {
    if (principal.role === 'ADMINISTRATOR') {
      if (customerId === undefined || customerId === null) {
        throw new InvalidShipmentError('customerId is required');
      }
      if (handledById === undefined || handledById === null) {
        throw new InvalidShipmentError('handledById is required');
      }
      const customer = await this.customers.findById(customerId);
      if (!customer) {
        throw new CustomerNotFoundError(customerId);
      }
      const handler = await this.users.findById(handledById);
      if (!handler) {
        throw new UserNotFoundError(handledById);
      }
      if (!handler.active) {
        throw new ShipmentHandlerInactiveError(handledById);
      }
      if (handler.role !== 'OPERATOR' || handler.customerId !== customerId) {
        throw new ShipmentHandlerRequiredError('Shipment handler must be an active OPERATOR linked to the shipment customer');
      }
      return { customerId, handledById };
    }
    if (principal.role === 'OPERATOR' && principal.customerId !== null) {
      return { customerId: principal.customerId, handledById: principal.userId };
    }
    if (principal.role === 'OPERATOR') {
      throw new CustomerScopeMissingError();
    }
    throw new AccessDeniedError('Only ADMINISTRATOR and OPERATOR profiles can register shipments');
  }
}
