import { ApiProperty } from '@nestjs/swagger';
import { HealthReport } from '../../../application/ports/health-check.port.js';

export class HealthPresenter {
  @ApiProperty({ enum: ['healthy', 'degraded'], example: 'healthy', description: 'Status geral do serviço' })
  status!: 'healthy' | 'degraded';

  @ApiProperty({ enum: ['up', 'down'], example: 'up', description: 'Disponibilidade do banco de dados' })
  database!: 'up' | 'down';

  @ApiProperty({ type: Number, example: 3, description: 'Latência da verificação no banco (ms)' })
  latencyMs!: number;

  @ApiProperty({ type: Number, example: 120, description: 'Uptime do processo (s)' })
  uptimeSeconds!: number;

  @ApiProperty({ example: 'v24.21.0', description: 'Versão do Node.js' })
  nodeVersion!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-16T20:30:00.000Z', description: 'Momento da verificação' })
  checkedAt!: string;

  static fromReport(report: HealthReport): HealthPresenter {
    const presenter = new HealthPresenter();
    presenter.status = report.status;
    presenter.database = report.database;
    presenter.latencyMs = report.latencyMs;
    presenter.uptimeSeconds = report.uptimeSeconds;
    presenter.nodeVersion = report.nodeVersion;
    presenter.checkedAt = report.checkedAt;
    return presenter;
  }
}
