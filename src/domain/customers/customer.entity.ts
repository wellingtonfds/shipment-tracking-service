import { DomainError } from '../shared/errors/domain.error.js';

export interface CustomerProps {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly address: string;
}

export interface Customer extends CustomerProps {
  readonly id: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class InvalidCustomerError extends DomainError {
  constructor(message: string) {
    super('CUSTOMER_INVALID', message);
  }
}

function assertField(value: string, field: string, min: number): void {
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new InvalidCustomerError(`${field} must be at least ${min} characters long`);
  }
  if (trimmed.length > 255) {
    throw new InvalidCustomerError(`${field} must be at most 255 characters long`);
  }
}

export function validateCustomer(data: CustomerProps): CustomerProps {
  assertField(data.name, 'name', 2);
  const email = data.email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    throw new InvalidCustomerError('invalid email');
  }
  assertField(data.phone, 'phone', 8);
  assertField(data.address, 'address', 5);
  return { name: data.name.trim(), email, phone: data.phone.trim(), address: data.address.trim() };
}
