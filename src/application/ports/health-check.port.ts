export type ComponentStatus = 'up' | 'down';

export interface DatabaseHealthSnapshot {
  readonly database: ComponentStatus;
  readonly latencyMs: number;
}

export interface HealthReport {
  readonly status: 'healthy' | 'degraded';
  readonly database: ComponentStatus;
  readonly latencyMs: number;
  readonly uptimeSeconds: number;
  readonly nodeVersion: string;
  readonly checkedAt: string;
}

export interface HealthCheckPort {
  snapshot(): Promise<DatabaseHealthSnapshot>;
}
