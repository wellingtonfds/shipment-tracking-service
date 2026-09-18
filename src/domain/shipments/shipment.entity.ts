import { DomainError } from '../shared/errors/domain.error.js';
import { AccessDeniedError } from '../users/errors/access-denied.error.js';
import { CustomerScopeMissingError } from './errors/customer-scope-missing.error.js';
import { ShipmentInvalidDatesError } from './errors/shipment-invalid-dates.error.js';
import { ShipmentInvalidTransitionError } from './errors/shipment-invalid-transition.error.js';

export type ShipmentStatus = 'CREATED' | 'IN_TRANSIT' | 'TRANSFERRED' | 'DELIVERED';

export const SHIPMENT_STATUSES: readonly ShipmentStatus[] = ['CREATED', 'IN_TRANSIT', 'TRANSFERRED', 'DELIVERED'] as const;

export interface Shipment {
  readonly id: number;
  readonly cargoCode: string;
  readonly status: ShipmentStatus;
  readonly originCity: string;
  readonly originCountry: string;
  readonly originLatitude: number | null;
  readonly originLongitude: number | null;
  readonly destinationCity: string;
  readonly destinationCountry: string;
  readonly destinationLatitude: number | null;
  readonly destinationLongitude: number | null;
  readonly geocodedAt: Date | null;
  readonly geocodeProvider: string | null;
  readonly departureDate: Date;
  readonly estimatedDeliveryDate: Date;
  readonly deliveredAt: Date | null;
  readonly customerId: number;
  readonly handledById: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ShipmentEvent {
  readonly id: number;
  readonly shipmentId: number;
  readonly status: ShipmentStatus;
  readonly occurredAt: Date;
  readonly locationText: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly notes: string | null;
  readonly createdById: number | null;
  readonly createdAt: Date;
}

/** Snapshot of the latest known location, always derived from shipment_events. */
export interface ShipmentLocation {
  readonly locationText: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface ShipmentWithLocation extends Shipment {
  /** Latest event location (the cargo's current location), or null when it has no history yet. */
  readonly currentLocation: ShipmentLocation | null;
}

/** Authenticated principal injected by the infrastructure (mirrors AuthPayload). */
export interface TenantPrincipal {
  readonly userId: number;
  readonly role: string;
  readonly customerId: number | null;
}

export class InvalidShipmentError extends DomainError {
  constructor(message: string) {
    super('SHIPMENT_INVALID', message);
  }
}

/**
 * Tenant scoping derived from the token, never from request parameters.
 * Returns the forced customer id for OPERATOR/CUSTOMER, or null for ADMINISTRATOR.
 */
export function applyTenantScope(principal: TenantPrincipal): number | null {
  if (principal.role === 'ADMINISTRATOR') {
    return null;
  }
  if (principal.customerId === null) {
    throw new CustomerScopeMissingError();
  }
  return principal.customerId;
}

/** Write operations are restricted to ADMINISTRATOR and linked OPERATOR profiles. */
export function assertCanManageShipments(principal: TenantPrincipal): void {
  if (principal.role === 'ADMINISTRATOR') {
    return;
  }
  if (principal.role === 'OPERATOR' && principal.customerId !== null) {
    return;
  }
  if (principal.role === 'CUSTOMER') {
    throw new AccessDeniedError('CUSTOMER profile is read-only for shipments');
  }
  throw new CustomerScopeMissingError();
}

export function normalizeStatus(value: unknown): ShipmentStatus {
  if (typeof value !== 'string') {
    throw new InvalidShipmentError('status must be a string');
  }
  const normalized = value.trim().toUpperCase();
  if (!(SHIPMENT_STATUSES as readonly string[]).includes(normalized)) {
    throw new InvalidShipmentError(`status must be one of ${SHIPMENT_STATUSES.join(', ')}`);
  }
  return normalized as ShipmentStatus;
}

const ALLOWED_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  CREATED: ['IN_TRANSIT'],
  IN_TRANSIT: ['TRANSFERRED'],
  TRANSFERRED: ['DELIVERED'],
  DELIVERED: [],
};

export function canTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return from !== to && ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ShipmentStatus, to: ShipmentStatus): void {
  if (!canTransition(from, to)) {
    throw new ShipmentInvalidTransitionError(from, to);
  }
}

/** PUT /tracking/{cargoCode}/entrega: DELIVERED from any non-terminal status. */
export function canDeliver(from: ShipmentStatus): boolean {
  return from !== 'DELIVERED';
}

export function assertDeliverable(from: ShipmentStatus): void {
  if (!canDeliver(from)) {
    throw new ShipmentInvalidTransitionError(from, 'DELIVERED');
  }
}

export function assertCargoCode(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InvalidShipmentError('cargoCode must be a string');
  }
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) {
    throw new InvalidShipmentError('cargoCode is required');
  }
  if (normalized.length > 40) {
    throw new InvalidShipmentError('cargoCode must be at most 40 characters long');
  }
  return normalized;
}

function assertText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new InvalidShipmentError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvalidShipmentError(`${field} is required`);
  }
  if (trimmed.length > max) {
    throw new InvalidShipmentError(`${field} must be at most ${max} characters long`);
  }
  return trimmed;
}

function assertLatitude(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -90 || value > 90) {
    throw new InvalidShipmentError('latitude must be a number between -90 and 90');
  }
  return value;
}

function assertLongitude(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -180 || value > 180) {
    throw new InvalidShipmentError('longitude must be a number between -180 and 180');
  }
  return value;
}

function assertCoordinatePair(latitude: number | null, longitude: number | null): void {
  if ((latitude === null) !== (longitude === null)) {
    throw new InvalidShipmentError('latitude and longitude must be provided together');
  }
}

export function parseDateInput(value: unknown, field: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  throw new InvalidShipmentError(`${field} must be a valid date`);
}

export function assertDeliveryWindow(departureDate: Date, estimatedDeliveryDate: Date, now: Date): void {
  if (estimatedDeliveryDate.getTime() < departureDate.getTime()) {
    throw new ShipmentInvalidDatesError('estimatedDeliveryDate cannot be before departureDate');
  }
  if (estimatedDeliveryDate.getTime() < now.getTime()) {
    throw new ShipmentInvalidDatesError('estimatedDeliveryDate cannot be before the registration date');
  }
}

export interface CreateShipmentInput {
  readonly cargoCode: string;
  readonly originCity: string;
  readonly originCountry: string;
  readonly originLatitude?: number | null;
  readonly originLongitude?: number | null;
  readonly destinationCity: string;
  readonly destinationCountry: string;
  readonly destinationLatitude?: number | null;
  readonly destinationLongitude?: number | null;
  readonly departureDate: string | Date;
  readonly estimatedDeliveryDate: string | Date;
}

export interface NormalizedCreateShipment {
  readonly cargoCode: string;
  readonly status: 'CREATED';
  readonly originCity: string;
  readonly originCountry: string;
  readonly originLatitude: number | null;
  readonly originLongitude: number | null;
  readonly destinationCity: string;
  readonly destinationCountry: string;
  readonly destinationLatitude: number | null;
  readonly destinationLongitude: number | null;
  readonly departureDate: Date;
  readonly estimatedDeliveryDate: Date;
}

export function validateCreateShipment(input: CreateShipmentInput, now: Date = new Date()): NormalizedCreateShipment {
  const cargoCode = assertCargoCode(input.cargoCode);
  const originCity = assertText(input.originCity, 'originCity', 120);
  const originCountry = assertText(input.originCountry, 'originCountry', 80);
  const originLatitude = assertLatitude(input.originLatitude);
  const originLongitude = assertLongitude(input.originLongitude);
  assertCoordinatePair(originLatitude, originLongitude);
  const destinationCity = assertText(input.destinationCity, 'destinationCity', 120);
  const destinationCountry = assertText(input.destinationCountry, 'destinationCountry', 80);
  const destinationLatitude = assertLatitude(input.destinationLatitude);
  const destinationLongitude = assertLongitude(input.destinationLongitude);
  assertCoordinatePair(destinationLatitude, destinationLongitude);
  const departureDate = parseDateInput(input.departureDate, 'departureDate');
  const estimatedDeliveryDate = parseDateInput(input.estimatedDeliveryDate, 'estimatedDeliveryDate');
  assertDeliveryWindow(departureDate, estimatedDeliveryDate, now);
  return {
    cargoCode,
    status: 'CREATED',
    originCity,
    originCountry,
    originLatitude,
    originLongitude,
    destinationCity,
    destinationCountry,
    destinationLatitude,
    destinationLongitude,
    departureDate,
    estimatedDeliveryDate,
  };
}

export interface ShipmentLocationInput {
  readonly locationText: string;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly notes?: string | null;
}

export interface NormalizedShipmentLocation {
  readonly locationText: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly notes: string | null;
}

export function validateShipmentLocation(input: ShipmentLocationInput): NormalizedShipmentLocation {
  const locationText = assertText(input.locationText, 'locationText', 255);
  const latitude = assertLatitude(input.latitude);
  const longitude = assertLongitude(input.longitude);
  assertCoordinatePair(latitude, longitude);
  const notes = input.notes === null || input.notes === undefined || input.notes.trim().length === 0 ? null : assertText(input.notes, 'notes', 500);
  return { locationText, latitude, longitude, notes };
}
