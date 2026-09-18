import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CreateUserUseCase } from '../../../application/users/use-cases/create-user.use-case.js';
import { GetUserUseCase } from '../../../application/users/use-cases/get-user.use-case.js';
import { ListUsersUseCase } from '../../../application/users/use-cases/list-users.use-case.js';
import { UpdateUserUseCase } from '../../../application/users/use-cases/update-user.use-case.js';
import { DeleteUserUseCase } from '../../../application/users/use-cases/delete-user.use-case.js';
import { GetMyProfileUseCase } from '../../../application/users/use-cases/get-my-profile.use-case.js';
import { UpdateMyProfileUseCase } from '../../../application/users/use-cases/update-my-profile.use-case.js';
import { LoginUseCase } from '../../../application/users/use-cases/login.use-case.js';
import {
  CREATE_USER_USE_CASE,
  DELETE_USER_USE_CASE,
  GET_MY_PROFILE_USE_CASE,
  GET_USER_USE_CASE,
  LIST_USERS_USE_CASE,
  LOGIN_USE_CASE,
  PASSWORD_HASHER,
  TOKEN_SERVICE,
  UPDATE_MY_PROFILE_USE_CASE,
  UPDATE_USER_USE_CASE,
  USER_REPOSITORY,
} from '../../../application/users/user.tokens.js';
import type { CustomerRepositoryPort } from '../../../domain/customers/ports/customer-repository.port.js';
import { CUSTOMER_REPOSITORY } from '../../../application/customers/customer.tokens.js';
import { CustomersModule } from '../customers/customers.module.js';
import { PrismaUserRepositoryAdapter } from '../../database/users/prisma-user-repository.adapter.js';
import { JwtTokenService } from '../../security/jwt-token.service.js';
import { ScryptPasswordHasher } from '../../security/scrypt-password-hasher.js';
import { AuthController } from './auth.controller.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [
    CustomersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('jwtSecret');
        if (!secret) {
          throw new Error('JWT_SECRET missing from environment');
        }
        return { secret, signOptions: { expiresIn: config.get<number>('jwtExpiresIn') ?? 8 * 3600 } };
      },
    }),
  ],
  controllers: [UsersController, AuthController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepositoryAdapter },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: LOGIN_USE_CASE, useFactory: (repo, hasher, tokens) => new LoginUseCase(repo, hasher, tokens), inject: [USER_REPOSITORY, PASSWORD_HASHER, TOKEN_SERVICE] },
    { provide: LIST_USERS_USE_CASE, useFactory: (repo) => new ListUsersUseCase(repo), inject: [USER_REPOSITORY] },
    { provide: GET_USER_USE_CASE, useFactory: (repo) => new GetUserUseCase(repo), inject: [USER_REPOSITORY] },
    { provide: CREATE_USER_USE_CASE, useFactory: (repo, hasher) => new CreateUserUseCase(repo, hasher), inject: [USER_REPOSITORY, PASSWORD_HASHER] },
    { provide: UPDATE_USER_USE_CASE, useFactory: (repo, hasher) => new UpdateUserUseCase(repo, hasher), inject: [USER_REPOSITORY, PASSWORD_HASHER] },
    { provide: DELETE_USER_USE_CASE, useFactory: (repo) => new DeleteUserUseCase(repo), inject: [USER_REPOSITORY] },
    {
      provide: GET_MY_PROFILE_USE_CASE,
      useFactory: (repo, customers: CustomerRepositoryPort) => new GetMyProfileUseCase(repo, customers),
      inject: [USER_REPOSITORY, CUSTOMER_REPOSITORY],
    },
    { provide: UPDATE_MY_PROFILE_USE_CASE, useFactory: (repo, hasher) => new UpdateMyProfileUseCase(repo, hasher), inject: [USER_REPOSITORY, PASSWORD_HASHER] },
  ],
  exports: [TOKEN_SERVICE],
})
export class UsersModule {}
