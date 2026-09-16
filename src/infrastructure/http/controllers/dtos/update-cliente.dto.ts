import { PartialType } from '@nestjs/swagger';
import { CreateClienteDto } from './create-cliente.dto.js';

export class UpdateClienteDto extends PartialType(CreateClienteDto) {}
