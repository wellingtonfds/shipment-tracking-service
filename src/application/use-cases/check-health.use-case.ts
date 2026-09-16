import { HealthCheckPort, HealthReport } from '../ports/health-check.port.js';

export class CheckHealthUseCase {
  constructor(private readonly healthCheck: HealthCheckPort) {}

  async execute(): Promise<HealthReport> {
    const snapshot = await this.healthCheck.snapshot();

    return {
      status: snapshot.database === 'up' ? 'healthy' : 'degraded',
      database: snapshot.database,
      latencyMs: snapshot.latencyMs,
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      checkedAt: new Date().toISOString(),
    };
  }
}
