import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import type { TrackingConfig } from '../../config/configuration.js';
import {
  TrackingGeocoder,
  type TrackingLocation,
} from './tracking-geocoder.js';

const location: TrackingLocation = {
  locationText: 'São Paulo',
  latitude: null,
  longitude: null,
};
const config: TrackingConfig['geocoder'] = {
  url: 'https://geocoder.example/search',
  userAgent: 'tracking-tests',
  apiKey: 'secret',
  rateLimit: 2,
  cacheTtlSeconds: 3600,
  circuitFailures: 2,
  circuitCooldownMs: 5000,
  timeoutMs: 1000,
};

function harness(settings: TrackingConfig['geocoder'] = config) {
  const values = new Map<string, string>();
  const redis = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      keys.forEach((key) => values.delete(key));
      return keys.length;
    }),
    incr: vi.fn(async (key: string) => {
      const count = Number(values.get(key) ?? 0) + 1;
      values.set(key, String(count));
      return count;
    }),
    pexpire: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue(0),
  };
  return {
    values,
    redis,
    geocoder: new TrackingGeocoder(redis as unknown as Redis, () => settings),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('TrackingGeocoder', () => {
  it('rejects invalid addresses in the strict geocoding contract', async () => {
    const { geocoder } = harness();

    await expect(geocoder.geocode('x')).rejects.toMatchObject({
      code: 'GEOCODING_INVALID_ADDRESS',
    });
  });

  it('reports no result and provider unavailability distinctly', async () => {
    const noResult = harness().geocoder;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => [] }),
    );
    await expect(noResult.geocode('Unknown address')).rejects.toMatchObject({
      code: 'GEOCODING_RESULT_NOT_FOUND',
    });

    const unavailable = harness().geocoder;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    await expect(
      unavailable.geocode('Unavailable address'),
    ).rejects.toMatchObject({ code: 'GEOCODING_PROVIDER_UNAVAILABLE' });
  });

  it('preserves coordinates already supplied and does not call Redis or HTTP', async () => {
    const { geocoder, redis } = harness();
    const ready = { ...location, latitude: -23.5, longitude: -46.6 };

    await expect(geocoder.resolveLocation(ready)).resolves.toBe(ready);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('preserves text when the provider is disabled', async () => {
    const { geocoder, redis } = harness({ ...config, url: undefined });

    await expect(geocoder.resolveLocation(location)).resolves.toBe(location);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('uses cached coordinates without calling the provider', async () => {
    const { geocoder, values, redis } = harness();
    const cacheKey = await cacheKeyFor(location.locationText);
    values.set(cacheKey, JSON.stringify({ latitude: -23.5, longitude: -46.6 }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(geocoder.resolveLocation(location)).resolves.toEqual({
      ...location,
      latitude: -23.5,
      longitude: -46.6,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('calls the provider with headers and caches valid coordinates', async () => {
    const { geocoder, redis } = harness();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '-23.5', lon: '-46.6' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(geocoder.resolveLocation(location)).resolves.toEqual({
      ...location,
      latitude: -23.5,
      longitude: -46.6,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        searchParams: expect.any(URLSearchParams),
      }),
      expect.objectContaining({
        headers: {
          'User-Agent': 'tracking-tests',
          Authorization: 'Bearer secret',
        },
      }),
    );
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('tracking:geocode:'),
      JSON.stringify({ latitude: -23.5, longitude: -46.6 }),
      'EX',
      3600,
    );
  });

  it.each([
    [[]],
    [[{ lat: 'NaN', lon: '10' }]],
    [[{ lat: '91', lon: '10' }]],
    [[{ lat: '10', lon: '-181' }]],
  ])(
    'retains location when the provider has no usable coordinates',
    async (results) => {
      const { geocoder, redis } = harness();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => results }),
      );

      await expect(geocoder.resolveLocation(location)).resolves.toBe(location);
      expect(redis.set).not.toHaveBeenCalled();
    },
  );

  it('opens the circuit after repeated provider errors', async () => {
    const { geocoder, redis } = harness();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(geocoder.resolveLocation(location)).resolves.toBe(location);
    await expect(geocoder.resolveLocation(location)).resolves.toBe(location);
    await expect(geocoder.resolveLocation(location)).resolves.toBe(location);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining(':open'),
      'open',
      'PX',
      5000,
    );
  });

  it('permits one half-open probe and closes the circuit after success', async () => {
    const { geocoder, values, redis } = harness();
    values.set((await circuitKeyFor()) + ':ever-opened', '1');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '10', lon: '20' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(geocoder.resolveLocation(location)).resolves.toMatchObject({
      latitude: 10,
      longitude: 20,
    });
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining(':half-open'),
      expect.any(String),
      'PX',
      2000,
      'NX',
    );
    expect(redis.del).toHaveBeenCalledWith(
      expect.stringContaining(':failures'),
      expect.stringContaining(':open'),
      expect.stringContaining(':half-open'),
      expect.stringContaining(':ever-opened'),
    );
  });

  it('waits when the provider rate limit window is full', async () => {
    const { geocoder, redis } = harness();
    redis.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
    );

    await expect(geocoder.resolveLocation(location)).resolves.toBe(location);
    expect(redis.eval).toHaveBeenCalledTimes(2);
  });
});

async function cacheKeyFor(text: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return `tracking:geocode:${createHash('sha256').update(`${config.url}:${text.toLowerCase().trim()}`).digest('hex')}`;
}

async function circuitKeyFor(): Promise<string> {
  const { createHash } = await import('node:crypto');
  return `tracking:geocode:circuit:${createHash('sha256').update(config.url!).digest('hex')}`;
}
