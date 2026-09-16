import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'John Doe', description: 'Customer full name (2-120 characters)', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'john.doe@example.com', description: 'Unique customer email', format: 'email' })
  @IsEmail({}, { message: 'invalid email' })
  @MaxLength(160)
  email!: string;

  @ApiProperty({ example: '(11) 98888-7777', description: 'Phone number with area code (at least 8 characters)', minLength: 8, maxLength: 40 })
  @IsString()
  @MinLength(8)
  @MaxLength(40)
  phone!: string;

  @ApiProperty({ example: 'Paulista Ave, 1000 - apt 42', description: 'Full address (5-255 characters)', minLength: 5, maxLength: 255 })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  address!: string;
}
