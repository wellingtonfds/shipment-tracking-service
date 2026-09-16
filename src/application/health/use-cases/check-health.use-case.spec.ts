import { CheckHealthUseCase } from './check-health.use-case.js';
import { DatabaseHealthSnapshot, HealthCheckPort } from '../health-check.port.js';

function fakePort(snapshot: DatabaseHealthSnapshot): HealthCheckPort {
  return { snapshot: () => Promise.resolve(snapshot) };
}

describe('CheckHealthUseCase', () => {
  it('retorna healthy quando o banco responde', async () => {
    const useCase = new CheckHealthUseCase(fakePort({ database: 'up', latencyMs: 3 }));

    const report = await useCase.execute();

    expect(report.status).toBe('healthy');
    expect(report.database).toBe('up');
    expect(report.latencyMs).toBe(3);
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(report.nodeVersion).toBe(process.version);
    expect(report.checkedAt).toBeTruthy();
  });

  it('retorna degraded quando o banco nao responde', async () => {
    const useCase = new CheckHealthUseCase(fakePort({ database: 'down', latencyMs: 5000 }));

    const report = await useCase.execute();

    expect(report.status).toBe('degraded');
    expect(report.database).toBe('down');
  });
});
