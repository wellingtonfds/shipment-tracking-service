import { ApiProperty } from '@nestjs/swagger';

export class AuthResponsePresenter {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'JWT bearer token (use as Authorization: Bearer <token>)' })
  token!: string;

  static fromResult(result: { token: string }): AuthResponsePresenter {
    const presenter = new AuthResponsePresenter();
    presenter.token = result.token;
    return presenter;
  }
}
