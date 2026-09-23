import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { Redis } from 'ioredis';
import type { TrackingConfig } from '../src/infrastructure/config/configuration.js';
import { TrackingGeocoder } from '../src/infrastructure/database/shipments/tracking-geocoder.js';

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Could not start test geocoder');
  return `http://127.0.0.1:${address.port}/search`;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function redisKeys(endpoint: string, locations: string[]): string[] {
  const providerKey = createHash('sha256').update(endpoint).digest('hex');
  return [
    ...locations.map(
      (location) =>
        `tracking:geocode:${createHash('sha256').update(`${endpoint}:${location.toLowerCase().trim()}`).digest('hex')}`,
    ),
    `tracking:geocode:circuit:${providerKey}:open`,
    `tracking:geocode:circuit:${providerKey}:half-open`,
    `tracking:geocode:circuit:${providerKey}:ever-opened`,
    `tracking:geocode:circuit:${providerKey}:failures`,
    `tracking:geocode:rate-limit:${providerKey}`,
  ];
}

describe('Tracking geocoder (integration)', () => {
  it('caches coordinates, keeps text on failure, and isolates provider circuits', async () => {
    const checkpoint = `Cache checkpoint ${randomUUID()}`;
    const outage = `Provider outage ${randomUUID()}`;
    const blocked = `Circuit open fallback ${randomUUID()}`;
    const independent = `Independent provider ${randomUUID()}`;
    let firstCalls = 0;
    let secondCalls = 0;
    const firstServer = createServer((req, res) => {
      firstCalls += 1;
      const query = new URL(
        req.url ?? '/',
        'http://localhost',
      ).searchParams.get('q');
      if (query === outage) {
        res.statusCode = 503;
        res.end();
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify([{ lat: '-9.123456', lon: '-35.123456' }]));
    });
    const secondServer = createServer((_req, res) => {
      secondCalls += 1;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify([{ lat: '-8.123456', lon: '-34.123456' }]));
    });
    const redis = new Redis({
      host: '127.0.0.1',
      port: 6380,
      db: 15,
      lazyConnect: true,
      retryStrategy: null,
      connectTimeout: 2000,
    });
    let keys: string[] = [];
    let connected = false;
    try {
      const firstEndpoint = await listen(firstServer);
      const secondEndpoint = await listen(secondServer);
      keys = [
        ...redisKeys(firstEndpoint, [checkpoint, outage, blocked]),
        ...redisKeys(secondEndpoint, [independent]),
      ];
      await redis.connect();
      connected = true;
      await redis.del(...keys);

      const config: TrackingConfig['geocoder'] = {
        url: firstEndpoint,
        userAgent: 'shipment-tracking-integration-test/1.0',
        rateLimit: 10,
        cacheTtlSeconds: 60,
        circuitFailures: 1,
        circuitCooldownMs: 30000,
        timeoutMs: 3000,
      };
      const geocoder = new TrackingGeocoder(redis, () => config);
      const firstLocation = {
        locationText: checkpoint,
        latitude: null,
        longitude: null,
      };
      expect(await geocoder.resolveLocation(firstLocation)).toEqual({
        locationText: checkpoint,
        latitude: -9.123456,
        longitude: -35.123456,
      });
      expect(firstCalls).toBe(1);
      expect(await geocoder.resolveLocation(firstLocation)).toEqual({
        locationText: checkpoint,
        latitude: -9.123456,
        longitude: -35.123456,
      });
      expect(firstCalls).toBe(1);

      const outageLocation = {
        locationText: outage,
        latitude: null,
        longitude: null,
      };
      expect(await geocoder.resolveLocation(outageLocation)).toEqual(
        outageLocation,
      );
      expect(firstCalls).toBe(2);
      const blockedLocation = {
        locationText: blocked,
        latitude: null,
        longitude: null,
      };
      expect(await geocoder.resolveLocation(blockedLocation)).toEqual(
        blockedLocation,
      );
      expect(firstCalls).toBe(2);

      config.url = secondEndpoint;
      expect(
        await geocoder.resolveLocation({
          locationText: independent,
          latitude: null,
          longitude: null,
        }),
      ).toEqual({
        locationText: independent,
        latitude: -8.123456,
        longitude: -34.123456,
      });
      expect(secondCalls).toBe(1);
    } finally {
      if (connected) {
        await redis.del(...keys);
        await redis.quit();
      } else {
        redis.disconnect();
      }
      await close(firstServer);
      await close(secondServer);
    }
  });
});
