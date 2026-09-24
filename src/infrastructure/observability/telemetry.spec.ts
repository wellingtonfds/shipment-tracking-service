import { describe, expect, it, vi } from 'vitest';
import { activeTraceFields, registerShutdown, startTelemetry } from './telemetry.js';

describe('OpenTelemetry bootstrap', () => {
  it('does not create an exporter without an internal OTLP endpoint', () => {
    expect(startTelemetry(undefined)).toBeUndefined();
    expect(activeTraceFields()).toEqual({});
  });

  it('starts OTLP traces and metrics with service attributes', () => {
    const start = vi.fn();
    const shutdown = vi.fn().mockResolvedValue(undefined);
    const createSdk = vi.fn().mockReturnValue({ start, shutdown });

    const sdk = startTelemetry('http://cloudwatch-agent:4316', {
      serviceName: 'tracking',
      environment: 'hml',
      createSdk,
    });

    expect(sdk).toEqual({ start, shutdown });
    expect(start).toHaveBeenCalledOnce();
    expect(createSdk).toHaveBeenCalledWith(
      expect.objectContaining({
        traceExporter: expect.objectContaining({}),
        metricReaders: expect.any(Array),
      }),
    );
  });

  it('flushes telemetry on process shutdown signals', () => {
    const once = vi.spyOn(process, 'once');
    const shutdown = vi.fn().mockResolvedValue(undefined);

    registerShutdown({ start: vi.fn(), shutdown });

    expect(once).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(once).toHaveBeenCalledWith('SIGINT', expect.any(Function));
  });
});
