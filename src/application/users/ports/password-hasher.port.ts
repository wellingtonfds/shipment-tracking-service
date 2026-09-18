export interface PasswordHasherPort {
  hash(plaintext: string): Promise<string>;
  compare(plaintext: string, passwordHash: string): Promise<boolean>;
}
