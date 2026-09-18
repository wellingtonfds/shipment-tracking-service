import { DomainError } from '../shared/errors/domain.error.js';

export type UserRole = 'ADMINISTRATOR' | 'OPERATOR' | 'CUSTOMER';

export const USER_ROLES: readonly UserRole[] = ['ADMINISTRATOR', 'OPERATOR', 'CUSTOMER'] as const;

export interface UserProps {
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly active: boolean;
  readonly customerId: number | null;
}

export interface User extends UserProps {
  readonly id: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class InvalidUserError extends DomainError {
  constructor(message: string) {
    super('USER_INVALID', message);
  }
}

export class UserCustomerLinkInvalidError extends DomainError {
  constructor(message: string) {
    super('USER_CUSTOMER_LINK_INVALID', message);
  }
}

function assertName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InvalidUserError('name must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    throw new InvalidUserError('name must be between 2 and 120 characters long');
  }
  return trimmed;
}

export function assertEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InvalidUserError('invalid email');
  }
  const normalized = value.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalized) || normalized.length > 160) {
    throw new InvalidUserError('invalid email');
  }
  return normalized;
}

function assertRole(value: unknown): UserRole {
  if (typeof value !== 'string') {
    throw new InvalidUserError('invalid role');
  }
  const normalized = value.trim().toUpperCase();
  if (!(USER_ROLES as readonly string[]).includes(normalized)) {
    throw new InvalidUserError('role must be one of ADMINISTRATOR, OPERATOR, CUSTOMER');
  }
  return normalized as UserRole;
}

function assertActive(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new InvalidUserError('active must be a boolean');
  }
  return value;
}

function assertCustomerId(value: unknown, path = 'customerId'): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new InvalidUserError(`${path} must be a positive integer or null`);
  }
  return value;
}

export function assertPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8) {
    throw new InvalidUserError('password must be at least 8 characters long');
  }
  if (value.length > 128) {
    throw new InvalidUserError('password must be at most 128 characters long');
  }
  return value;
}

export interface CreateUserInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly role: string;
  readonly active: boolean;
  readonly customerId: number | null;
}

export interface NormalizedUserInput extends UserProps {
  readonly password: string;
}

export function validateUser(input: CreateUserInput): NormalizedUserInput {
  const name = assertName(input.name);
  const email = assertEmail(input.email);
  const password = assertPassword(input.password);
  const role = assertRole(input.role);
  const active = assertActive(input.active);
  const customerId = assertCustomerId(input.customerId);
  assertUserCustomerLink(role, customerId);
  return { name, email, password, role, active, customerId };
}

export interface UpdateUserInput {
  readonly name?: string;
  readonly email?: string;
  readonly password?: string;
  readonly role?: string;
  readonly active?: boolean;
  readonly customerId?: number | null;
}

export interface NormalizedUserUpdate {
  readonly name?: string;
  readonly email?: string;
  readonly password?: string;
  readonly role?: UserRole;
  readonly active?: boolean;
  readonly customerId?: number | null;
}

export function validateUserUpdate(current: User, input: UpdateUserInput): NormalizedUserUpdate {
  const update: {
    name?: string;
    email?: string;
    password?: string;
    role?: UserRole;
    active?: boolean;
    customerId?: number | null;
  } = {};

  if (input.name !== undefined) {
    update.name = assertName(input.name);
  }
  if (input.email !== undefined) {
    update.email = assertEmail(input.email);
  }
  if (input.password !== undefined) {
    update.password = assertPassword(input.password);
  }
  if (input.role !== undefined) {
    update.role = assertRole(input.role);
  }
  if (input.active !== undefined) {
    update.active = assertActive(input.active);
  }
  if (input.customerId !== undefined) {
    const customerId = assertCustomerId(input.customerId);
    if (customerId === null) {
      const role = update.role ?? current.role;
      if (role === 'CUSTOMER') {
        throw new UserCustomerLinkInvalidError('CUSTOMER users must be linked to a customer');
      }
    }
    update.customerId = customerId;
  }

  const role = update.role ?? current.role;
  if (update.customerId !== undefined) {
    assertUserCustomerLink(role, update.customerId);
  } else if (update.role !== undefined) {
    assertUserCustomerLink(update.role, current.customerId);
  }

  return update;
}

export function assertUserCustomerLink(role: UserRole, customerId: number | null): void {
  if (role === 'ADMINISTRATOR' && customerId !== null) {
    throw new UserCustomerLinkInvalidError('ADMINISTRATOR users must not be linked to a customer');
  }
  if ((role === 'OPERATOR' || role === 'CUSTOMER') && customerId === null) {
    throw new UserCustomerLinkInvalidError('OPERATOR and CUSTOMER users must be linked to a customer');
  }
}
