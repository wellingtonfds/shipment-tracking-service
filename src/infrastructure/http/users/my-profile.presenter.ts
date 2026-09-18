import { ApiProperty } from '@nestjs/swagger';
import { UserPresenter } from './user.presenter.js';
import { CustomerPresenter } from '../customers/customer.presenter.js';
import { MyProfileResult } from '../../../application/users/use-cases/get-my-profile.use-case.js';

/**
 * GET /operadores/me response: the user profile with the linked customer
 * embedded (CUSTOMER profile only). Set only on GET — PUT /me keeps UserPresenter.
 */
export class MyProfilePresenter extends UserPresenter {
  @ApiProperty({ type: CustomerPresenter, nullable: true, description: 'Linked customer (CUSTOMER profile only)' })
  customer?: CustomerPresenter;

  static fromResult(result: MyProfileResult): MyProfilePresenter {
    const presenter = new MyProfilePresenter();
    const user = UserPresenter.fromEntity(result.user);
    presenter.id = user.id;
    presenter.name = user.name;
    presenter.email = user.email;
    presenter.role = user.role;
    presenter.active = user.active;
    presenter.customerId = user.customerId;
    presenter.createdAt = user.createdAt;
    presenter.updatedAt = user.updatedAt;
    if (result.customer) {
      presenter.customer = CustomerPresenter.fromEntity(result.customer);
    }
    return presenter;
  }
}
