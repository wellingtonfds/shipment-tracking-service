import { afterEach, describe, expect, it } from 'vitest';
import configuration from './configuration.js';

const trackingEnvironment = [
  'TRACKING_QUEUE_ENABLED',
  'TRACKING_WORKER_ROLE',
  'TRACKING_DISPATCHER_ROLE',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_TLS',
  'TRACKING_WORKER_CONCURRENCY',
  'GEOCODER_URL',
  'GEOCODE_RATE_LIMIT',
] as const;

const originalEnvironment = Object.fromEntries(
  trackingEnvironment.map((name) => [name, process.env[name]]),
);

function resetTrackingEnvironment(): void {
  for (const name of trackingEnvironment) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

describe('configuration', () => {
  afterEach(resetTrackingEnvironment);

  it('uses the public Nominatim endpoint and safe tracking defaults', () => {
    for (const name of trackingEnvironment) delete process.env[name];

    const config = configuration();

    expect(config.tracking).toMatchObject({
      queueEnabled: false,
      workerRole: false,
      dispatcherRole: true,
      redis: { port: 6379, tls: false },
      workerConcurrency: 8,
      geocoder: {
        url: 'https://nominatim.openstreetmap.org/search',
        userAgent: 'shipment-tracking-tests/1.0 (contato@empresa.com)',
        rateLimit: 1,
      },
    });
  });

  it('parses tracking overrides', () => {
    process.env.TRACKING_QUEUE_ENABLED = 'true';
    process.env.TRACKING_WORKER_ROLE = 'true';
    process.env.TRACKING_DISPATCHER_ROLE = 'false';
    process.env.REDIS_HOST = 'redis';
    process.env.REDIS_PORT = '6380';
    process.env.REDIS_TLS = 'true';
    process.env.TRACKING_WORKER_CONCURRENCY = '2';
    process.env.GEOCODER_URL = '';
    process.env.GEOCODE_RATE_LIMIT = '3';

    const config = configuration();

    expect(config.tracking).toMatchObject({
      queueEnabled: true,
      workerRole: true,
      dispatcherRole: false,
      redis: { host: 'redis', port: 6380, tls: true },
      workerConcurrency: 2,
      geocoder: { url: undefined, rateLimit: 3 },
    });
  });

  it('rejects invalid queue and geocoder settings', () => {
    process.env.TRACKING_QUEUE_ENABLED = 'true';
    delete process.env.REDIS_HOST;
    expect(configuration).toThrow(
      'REDIS_HOST is required when TRACKING_QUEUE_ENABLED=true',
    );

    process.env.TRACKING_QUEUE_ENABLED = 'false';
    process.env.GEOCODER_URL = 'ftp://example.com/search';
    expect(configuration).toThrow('GEOCODER_URL must be a valid HTTP(S) URL');
  });
});
