import { Injectable } from '@nestjs/common';
import { DatabaseHealthSnapshot, HealthCheckPort } from '../../../application/health/health-check.port.js';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaHealthCheckAdapter implements HealthCheckPort {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(): Promise<DatabaseHealthSnapshot> {
    const startedAt = performance.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: 'up', latencyMs: Math.round(performance.now() - startedAt) };
    } catch {
      return { database: 'down', latencyMs: Math.round(performance.now() - startedAt) };
    }
  }
}
