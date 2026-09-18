import { ApiProperty } from '@nestjs/swagger';
import { USER_ROLES } from '../../../domain/users/user.entity.js';
import { User } from '../../../domain/users/user.entity.js';

export class UserPresenter {
  @ApiProperty({ type: Number, example: 1, description: 'Unique user identifier' })
  id!: number;

  @ApiProperty({ example: 'Sergio Nogueira', description: 'User full name' })
  name!: string;

  @ApiProperty({ example: 'sergio.nogueira@logistica.com', description: 'User email (unique)', format: 'email' })
  email!: string;

  @ApiProperty({ enum: [...USER_ROLES], example: 'OPERATOR', description: 'Access profile' })
  role!: string;

  @ApiProperty({ example: true, description: 'Whether the user can authenticate' })
  active!: boolean;

  @ApiProperty({ type: Number, nullable: true, example: null, description: 'Linked customer id (required for CUSTOMER users)' })
  customerId!: number | null;

  @ApiProperty({ format: 'date-time', example: '2026-09-17T20:30:00.000Z', description: 'Creation date' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-17T20:30:00.000Z', description: 'Last update date' })
  updatedAt!: string;

  static fromEntity(user: User): UserPresenter {
    const presenter = new UserPresenter();
    presenter.id = user.id;
    presenter.name = user.name;
    presenter.email = user.email;
    presenter.role = user.role;
    presenter.active = user.active;
    presenter.customerId = user.customerId;
    presenter.createdAt = user.createdAt.toISOString();
    presenter.updatedAt = user.updatedAt.toISOString();
    return presenter;
  }
}

export class ListUsersMetaPresenter {
  @ApiProperty({ type: Number, example: 13, description: 'Total users' })
  total!: number;

  @ApiProperty({ type: Number, example: 1, description: 'Current page' })
  page!: number;

  @ApiProperty({ type: Number, example: 10, description: 'Items per page' })
  limit!: number;

  @ApiProperty({ type: Number, example: 2, description: 'Total pages' })
  totalPages!: number;
}

export class ListUsersPresenter {
  @ApiProperty({ type: [UserPresenter], description: 'Users of the page' })
  data!: UserPresenter[];

  @ApiProperty({ type: ListUsersMetaPresenter, description: 'Pagination metadata' })
  meta!: ListUsersMetaPresenter;

  static fromPaginated(result: { data: User[]; total: number; page: number; limit: number; totalPages: number }): ListUsersPresenter {
    const presenter = new ListUsersPresenter();
    presenter.data = result.data.map((user) => UserPresenter.fromEntity(user));
    presenter.meta = new ListUsersMetaPresenter();
    presenter.meta.total = result.total;
    presenter.meta.page = result.page;
    presenter.meta.limit = result.limit;
    presenter.meta.totalPages = result.totalPages;
    return presenter;
  }
}
