import { Injectable } from '@nestjs/common';
import { Cliente, ClienteProps } from '../../domain/entities/cliente.entity.js';
import { AtualizarClienteDados, ClienteRepositoryPort } from '../../domain/ports/cliente-repository.port.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class PrismaClienteRepositoryAdapter implements ClienteRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(page: number, limit: number): Promise<Cliente[]> {
    const registros = await this.prisma.cliente.findMany({
      orderBy: { id: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return registros.map((registro) => this.toEntity(registro));
  }

  async count(): Promise<number> {
    return this.prisma.cliente.count();
  }

  async findById(id: number): Promise<Cliente | null> {
    const registro = await this.prisma.cliente.findUnique({ where: { id } });
    return registro ? this.toEntity(registro) : null;
  }

  async findByEmail(email: string): Promise<Cliente | null> {
    const registro = await this.prisma.cliente.findUnique({ where: { email } });
    return registro ? this.toEntity(registro) : null;
  }

  async create(dados: ClienteProps): Promise<Cliente> {
    const registro = await this.prisma.cliente.create({ data: dados });
    return this.toEntity(registro);
  }

  async update(id: number, dados: AtualizarClienteDados): Promise<Cliente> {
    const registro = await this.prisma.cliente.update({ where: { id }, data: dados });
    return this.toEntity(registro);
  }

  async delete(id: number): Promise<void> {
    await this.prisma.cliente.delete({ where: { id } });
  }

  private toEntity(registro: {
    id: number;
    nome: string;
    email: string;
    telefone: string;
    endereco: string;
    createdAt: Date;
    updatedAt: Date;
  }): Cliente {
    return {
      id: registro.id,
      nome: registro.nome,
      email: registro.email,
      telefone: registro.telefone,
      endereco: registro.endereco,
      createdAt: registro.createdAt,
      updatedAt: registro.updatedAt,
    };
  }
}
