import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { USER_ROLES } from '../../../../domain/users/user.entity.js';

export class ListUsersQueryDto {
  @ApiProperty({ example: 1, description: 'Page (starts at 1)', default: 1, minimum: 1, required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ example: 10, description: 'Items per page (1-100)', default: 10, minimum: 1, maximum: 100, required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @ApiProperty({ enum: [...USER_ROLES], example: 'OPERATOR', description: 'Filter by access profile', required: false })
  @IsOptional()
  @IsIn([...USER_ROLES])
  role?: string;

  @ApiProperty({ example: true, description: 'Filter by active flag', required: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  active?: boolean;
}
