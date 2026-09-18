export interface AuthPayload {
  readonly userId: number;
  readonly role: string;
  readonly customerId: number | null;
}

export interface TokenServicePort {
  sign(payload: AuthPayload): Promise<string>;
  verify(token: string): AuthPayload;
}
