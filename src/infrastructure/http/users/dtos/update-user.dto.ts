import { PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto.js';

/** Partial update: send only the fields to change (admin only). */
export class UpdateUserDto extends PartialType(CreateUserDto) {}
