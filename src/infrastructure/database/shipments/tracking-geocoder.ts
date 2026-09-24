import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import type {
  GeocodingCoordinates,
  GeocodingPort,
} from '../../../application/shipments/ports/geocoding.port.js';
import { GeocodingProviderUnavailableError } from '../../../domain/shipments/errors/geocoding-provider-unavailable.error.js';
import { GeocodingResultNotFoundError } from '../../../domain/shipments/errors/geocoding-result-not-found.error.js';
import { InvalidGeocodingAddressError } from '../../../domain/shipments/errors/invalid-geocoding-address.error.js';
import type { TrackingConfig } from '../../config/configuration.js';

export interface TrackingLocation {
  locationText: string;
  latitude: number | null;
  longitude: number | null;
}

export class TrackingGeocoder implements GeocodingPort, OnModuleDestroy {
  private readonly logger = new Logger(TrackingGeocoder.name);

  constructor(
    private readonly redis: Redis | undefined,
    private readonly getConfig: () => TrackingConfig['geocoder'],
    private readonly ownsRedis = false,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.ownsRedis) this.redis?.disconnect();
  }

  async geocode(address: string): Promise<GeocodingCoordinates> {
    const normalized = address.trim();
    if (normalized.length < 3 || normalized.length > 255)
      throw new InvalidGeocodingAddressError();

    const geocoder = this.getConfig();
    const endpoint = geocoder.url;
    if (!endpoint) throw new GeocodingProviderUnavailableError();

    const providerKey = createHash('sha256').update(endpoint).digest('hex');
    const cacheKey = `tracking:geocode:${createHash('sha256').update(`${endpoint}:${normalized.toLowerCase()}`).digest('hex')}`;
    const circuitKey = `tracking:geocode:circuit:${providerKey}:open`;
    const halfOpenKey = `tracking:geocode:circuit:${providerKey}:half-open`;
    const everOpenedKey = `tracking:geocode:circuit:${providerKey}:ever-opened`;
    const failuresKey = `tracking:geocode:circuit:${providerKey}:failures`;
    let isProbe = false;

    try {
      const cached = await this.redis?.get(cacheKey);
      if (cached) return JSON.parse(cached) as GeocodingCoordinates;
      if (await this.redis?.get(circuitKey))
        throw new GeocodingProviderUnavailableError();

      if (await this.redis?.get(everOpenedKey)) {
        const halfOpen = await this.redis?.set(
          halfOpenKey,
          randomUUID(),
          'PX',
          geocoder.timeoutMs + 1000,
          'NX',
        );
        if (halfOpen !== 'OK') throw new GeocodingProviderUnavailableError();
        isProbe = true;
      }

      if (this.redis)
        await this.waitForGeocodeSlot(providerKey, geocoder.rateLimit);
      const url = new URL(endpoint);
      url.searchParams.set('q', normalized);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');
      const headers: Record<string, string> = {
        'User-Agent': geocoder.userAgent,
      };
      if (geocoder.apiKey) headers.Authorization = `Bearer ${geocoder.apiKey}`;
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(geocoder.timeoutMs),
      });
      if (response.status === 400) throw new InvalidGeocodingAddressError();
      if (!response.ok) throw new GeocodingProviderUnavailableError();
      const results = (await response.json()) as Array<{
        lat: string;
        lon: string;
      }>;
      const first = results[0];
      if (!first) {
        await this.resetCircuit(
          failuresKey,
          circuitKey,
          halfOpenKey,
          everOpenedKey,
        );
        throw new GeocodingResultNotFoundError();
      }
      const coordinates = {
        latitude: Number(first.lat),
        longitude: Number(first.lon),
      };
      if (
        !Number.isFinite(coordinates.latitude) ||
        !Number.isFinite(coordinates.longitude) ||
        coordinates.latitude < -90 ||
        coordinates.latitude > 90 ||
        coordinates.longitude < -180 ||
        coordinates.longitude > 180
      )
        throw new GeocodingProviderUnavailableError();

      await this.resetCircuit(
        failuresKey,
        circuitKey,
        halfOpenKey,
        everOpenedKey,
      );
      await this.redis?.set(
        cacheKey,
        JSON.stringify(coordinates),
        'EX',
        geocoder.cacheTtlSeconds,
      );
      return coordinates;
    } catch (error) {
      if (
        error instanceof InvalidGeocodingAddressError ||
        error instanceof GeocodingResultNotFoundError
      )
        throw error;
      await this.recordFailure(
        failuresKey,
        circuitKey,
        halfOpenKey,
        everOpenedKey,
        providerKey,
        geocoder,
        isProbe,
      );
      this.logger.warn(
        { component: 'tracking-geocoder', event: 'geocoder.unavailable', error: String(error) },
        'Geocoder unavailable',
      );
      throw new GeocodingProviderUnavailableError();
    }
  }

  async resolveLocation(location: TrackingLocation): Promise<TrackingLocation> {
    if (location.latitude !== null && location.longitude !== null)
      return location;
    try {
      return { ...location, ...(await this.geocode(location.locationText)) };
    } catch (error) {
      this.logger.warn(
        `Geocoding failed; retaining textual location: ${String(error)}`,
      );
      return location;
    }
  }

  private async resetCircuit(...keys: string[]): Promise<void> {
    if (this.redis) await this.redis.del(...keys);
  }

  private async recordFailure(
    failuresKey: string,
    circuitKey: string,
    halfOpenKey: string,
    everOpenedKey: string,
    providerKey: string,
    geocoder: TrackingConfig['geocoder'],
    isProbe: boolean,
  ): Promise<void> {
    if (!this.redis) return;
    try {
      const failures = await this.redis.incr(failuresKey);
      if (failures === 1)
        await this.redis.pexpire(failuresKey, geocoder.circuitCooldownMs);
      if (failures >= geocoder.circuitFailures || isProbe) {
        const opened = await this.redis.set(
          circuitKey,
          'open',
          'PX',
          geocoder.circuitCooldownMs,
          'NX',
        );
        if (opened === 'OK')
          this.logger.error(
            {
              component: 'tracking-geocoder',
              event: 'geocoder.circuit.opened',
              providerKey,
              cooldownMs: geocoder.circuitCooldownMs,
            },
            'Geocoder circuit opened',
          );
        await this.redis.set(everOpenedKey, '1');
        await this.redis.del(failuresKey);
      }
      if (isProbe) await this.redis.del(halfOpenKey);
    } catch (error) {
      this.logger.warn(
        `Could not update geocoder circuit state: ${String(error)}`,
      );
    }
  }

  private async waitForGeocodeSlot(
    providerKey: string,
    rateLimit: number,
  ): Promise<void> {
    if (!this.redis) return;
    const windowMs = 1000;
    const maxRequests = Math.max(1, rateLimit);
    const key = `tracking:geocode:rate-limit:${providerKey}`;
    const script =
      "local now=tonumber(ARGV[1]); local window=tonumber(ARGV[2]); local limit=tonumber(ARGV[3]); redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now-window); local count=redis.call('ZCARD',KEYS[1]); if count < limit then redis.call('ZADD',KEYS[1],now,ARGV[4]); redis.call('PEXPIRE',KEYS[1],window); return 0 end; local first=redis.call('ZRANGE',KEYS[1],0,0,'WITHSCORES'); return tonumber(first[2])+window-now";
    while (true) {
      const waitMs = Number(
        await this.redis.eval(
          script,
          1,
          key,
          Date.now(),
          windowMs,
          maxRequests,
          randomUUID(),
        ),
      );
      if (waitMs <= 0) return;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
