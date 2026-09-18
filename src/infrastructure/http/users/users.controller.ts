import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CREATE_USER_USE_CASE,
  DELETE_USER_USE_CASE,
  GET_MY_PROFILE_USE_CASE,
  GET_USER_USE_CASE,
  LIST_USERS_USE_CASE,
  UPDATE_MY_PROFILE_USE_CASE,
  UPDATE_USER_USE_CASE,
} from '../../../application/users/user.tokens.js';
import { USER_ROLES, UserRole } from '../../../domain/users/user.entity.js';
import type { AuthPayload } from '../../../application/users/ports/token-service.port.js';
import { CreateUserUseCase } from '../../../application/users/use-cases/create-user.use-case.js';
import { GetUserUseCase } from '../../../application/users/use-cases/get-user.use-case.js';
import { ListUsersUseCase } from '../../../application/users/use-cases/list-users.use-case.js';
import { UpdateUserUseCase } from '../../../application/users/use-cases/update-user.use-case.js';
import { DeleteUserUseCase } from '../../../application/users/use-cases/delete-user.use-case.js';
import { GetMyProfileUseCase } from '../../../application/users/use-cases/get-my-profile.use-case.js';
import { UpdateMyProfileUseCase } from '../../../application/users/use-cases/update-my-profile.use-case.js';
import { Roles } from '../shared/guards/roles.decorator.js';
import { CurrentUser } from '../shared/guards/current-user.decorator.js';
import { CreateUserDto } from './dtos/create-user.dto.js';
import { UpdateUserDto } from './dtos/update-user.dto.js';
import { UpdateMyProfileDto } from './dtos/update-my-profile.dto.js';
import { ListUsersQueryDto } from './dtos/list-users-query.dto.js';
import { ListUsersPresenter, UserPresenter } from './user.presenter.js';
import { MyProfilePresenter } from './my-profile.presenter.js';
import { ErrorPresenter } from '../shared/presenters/error.presenter.js';

// Route kept in Portuguese (/operadores) per the tracking spec — code identifiers stay
// in English (English-only code); see docs/TRACKING_DEFINITION.md for the glossary.
@ApiTags('Operadores')
@ApiBearerAuth()
@ApiResponse({ status: 400, type: ErrorPresenter, description: 'Invalid input' })
@ApiResponse({ status: 401, type: ErrorPresenter, description: 'Missing, invalid or expired token' })
@ApiResponse({ status: 403, type: ErrorPresenter, description: 'Authenticated user lacks the ADMINISTRATOR profile' })
@Roles('ADMINISTRATOR')
@Controller('operadores')
export class UsersController {
  constructor(
    @Inject(LIST_USERS_USE_CASE)
    private readonly listUsers: ListUsersUseCase,
    @Inject(GET_USER_USE_CASE)
    private readonly getUser: GetUserUseCase,
    @Inject(CREATE_USER_USE_CASE)
    private readonly createUser: CreateUserUseCase,
    @Inject(UPDATE_USER_USE_CASE)
    private readonly updateUser: UpdateUserUseCase,
    @Inject(DELETE_USER_USE_CASE)
    private readonly deleteUser: DeleteUserUseCase,
    @Inject(GET_MY_PROFILE_USE_CASE)
    private readonly getMyProfile: GetMyProfileUseCase,
    @Inject(UPDATE_MY_PROFILE_USE_CASE)
    private readonly updateMyProfile: UpdateMyProfileUseCase,
  ) {}

  // Declared before ':id' so the static path is matched first.
  @Get('me')
  @Roles(...USER_ROLES)
  @ApiOperation({
    summary: 'Return the authenticated operator profile',
    description: 'Any authenticated profile can read its own data. Users linked to a customer (CUSTOMER profile) also receive the customer embedded.',
  })
  @ApiResponse({ status: 200, type: MyProfilePresenter, description: 'Authenticated profile (with linked customer when applicable)' })
  async getMe(@CurrentUser() user: AuthPayload): Promise<MyProfilePresenter> {
    const profile = await this.getMyProfile.execute(user.userId);
    return MyProfilePresenter.fromResult(profile);
  }

  @Put('me')
  @Roles(...USER_ROLES)
  @ApiOperation({ summary: 'Update the authenticated operator profile', description: 'Only name, email and password can change here (never role, active or customerId).' })
  @ApiResponse({ status: 200, type: UserPresenter, description: 'Profile updated' })
  @ApiResponse({ status: 409, type: ErrorPresenter, description: 'Email already registered by another user' })
  async updateMe(@CurrentUser() user: AuthPayload, @Body() dto: UpdateMyProfileDto): Promise<UserPresenter> {
    const profile = await this.updateMyProfile.execute(user.userId, dto);
    return UserPresenter.fromEntity(profile);
  }

  @Get()
  @ApiOperation({ summary: 'List all operators and users', description: 'Admin only. Paginated (?page, ?limit max 100) with optional ?role and ?active filters.' })
  @ApiResponse({ status: 200, type: ListUsersPresenter, description: 'Paginated list of users' })
  async list(@Query() query: ListUsersQueryDto): Promise<ListUsersPresenter> {
    const filters = {
      ...(query.role !== undefined ? { role: query.role as UserRole } : {}),
      ...(query.active !== undefined ? { active: query.active } : {}),
    };
    const result = await this.listUsers.execute(query.page, query.limit, filters);
    return ListUsersPresenter.fromPaginated(result);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Return details of an operator', description: 'Admin only. Never returns the password hash.' })
  @ApiResponse({ status: 200, type: UserPresenter, description: 'User found' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'User not found' })
  async getById(@Param('id', ParseIntPipe) id: number): Promise<UserPresenter> {
    const user = await this.getUser.execute(id);
    return UserPresenter.fromEntity(user);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new operator or user',
    description: 'Admin only. OPERATOR and CUSTOMER users require customerId; ADMINISTRATOR must not be linked.',
  })
  @ApiResponse({ status: 201, type: UserPresenter, description: 'User created' })
  @ApiResponse({ status: 409, type: ErrorPresenter, description: 'Email already registered' })
  @ApiResponse({ status: 422, type: ErrorPresenter, description: 'Invalid role/customer link' })
  async create(@Body() dto: CreateUserDto): Promise<UserPresenter> {
    const user = await this.createUser.execute({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      role: dto.role,
      active: dto.active ?? true,
      customerId: dto.customerId ?? null,
    });
    return UserPresenter.fromEntity(user);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update operator data',
    description: 'Admin only. Partial update: send only the fields to change. Role changes revalidate the customer link; password is re-hashed.',
  })
  @ApiResponse({ status: 200, type: UserPresenter, description: 'User updated' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'User not found' })
  @ApiResponse({ status: 409, type: ErrorPresenter, description: 'Email already registered by another user' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto): Promise<UserPresenter> {
    const user = await this.updateUser.execute(id, dto);
    return UserPresenter.fromEntity(user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deactivate an operator',
    description: 'Admin only. Soft-delete: sets active=false (removal is blocked while the user handles shipments).',
  })
  @ApiResponse({ status: 204, description: 'User deactivated' })
  @ApiResponse({ status: 404, type: ErrorPresenter, description: 'User not found' })
  async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.deleteUser.execute(id);
  }
}
