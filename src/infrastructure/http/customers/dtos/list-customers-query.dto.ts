import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ListCustomersQueryDto {
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
}
