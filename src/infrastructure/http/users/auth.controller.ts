import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LOGIN_USE_CASE } from '../../../application/users/user.tokens.js';
import { LoginUseCase } from '../../../application/users/use-cases/login.use-case.js';
import { Public } from '../shared/guards/public.decorator.js';
import { LoginDto } from './dtos/login.dto.js';
import { AuthResponsePresenter } from './auth.presenter.js';
import { ErrorPresenter } from '../shared/presenters/error.presenter.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(LOGIN_USE_CASE)
    private readonly loginUseCase: LoginUseCase,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate an operator', description: 'Validates email and password and returns a JWT bearer token with the user profile.' })
  @ApiResponse({ status: 200, type: AuthResponsePresenter, description: 'Authentication succeeded' })
  @ApiResponse({ status: 400, type: ErrorPresenter, description: 'Invalid input' })
  @ApiResponse({ status: 401, type: ErrorPresenter, description: 'Invalid email or password' })
  async login(@Body() dto: LoginDto): Promise<AuthResponsePresenter> {
    const result = await this.loginUseCase.execute(dto.email, dto.password);
    return AuthResponsePresenter.fromResult(result);
  }
}
