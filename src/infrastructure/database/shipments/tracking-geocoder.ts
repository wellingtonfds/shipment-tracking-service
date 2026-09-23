import { Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import type { TrackingConfig } from '../../config/configuration.js';

export interface TrackingLocation {
  locationText: string;
  latitude: number | null;
  longitude: number | null;
}

export class TrackingGeocoder {
  private readonly logger = new Logger(TrackingGeocoder.name);

  constructor(
    private readonly redis: Redis,
    private readonly getConfig: () => TrackingConfig['geocoder'],
  ) {}

  async resolveLocation(location: TrackingLocation): Promise<TrackingLocation> {
    if (location.latitude !== null && location.longitude !== null)
      return location;
    const geocoder = this.getConfig();
    const endpoint = geocoder.url;
    if (!endpoint) return location;
    const cooldown = geocoder.circuitCooldownMs;
    const providerKey = createHash('sha256').update(endpoint).digest('hex');
    const cacheKey = `tracking:geocode:${createHash('sha256').update(`${endpoint}:${location.locationText.toLowerCase().trim()}`).digest('hex')}`;
    const cached = await this.redis.get(cacheKey);
    if (cached)
      return {
        ...location,
        ...(JSON.parse(cached) as { latitude: number; longitude: number }),
      };
    const circuitKey = `tracking:geocode:circuit:${providerKey}:open`;
    if (await this.redis.get(circuitKey)) return location;
    const halfOpenKey = `tracking:geocode:circuit:${providerKey}:half-open`;
    const hasOpenedBefore = await this.redis.get(
      `tracking:geocode:circuit:${providerKey}:ever-opened`,
    );
    let isProbe = false;
    if (hasOpenedBefore) {
      const halfOpen = await this.redis.set(
        halfOpenKey,
        randomUUID(),
        'PX',
        geocoder.timeoutMs + 1000,
        'NX',
      );
      if (halfOpen !== 'OK') return location;
      isProbe = true;
    }
    const failuresKey = `tracking:geocode:circuit:${providerKey}:failures`;
    try {
      await this.waitForGeocodeSlot(providerKey, geocoder.rateLimit);
      const url = new URL(endpoint);
      url.searchParams.set('q', location.locationText);
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
      if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
      const results = (await response.json()) as Array<{
        lat: string;
        lon: string;
      }>;
      await this.redis.del(
        failuresKey,
        circuitKey,
        halfOpenKey,
        `tracking:geocode:circuit:${providerKey}:ever-opened`,
      );
      const first = results[0];
      if (!first) return location;
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
        return location;
      await this.redis.set(
        cacheKey,
        JSON.stringify(coordinates),
        'EX',
        geocoder.cacheTtlSeconds,
      );
      return { ...location, ...coordinates };
    } catch (error) {
      const failures = await this.redis.incr(failuresKey);
      if (failures === 1) await this.redis.pexpire(failuresKey, cooldown);
      if (failures >= geocoder.circuitFailures || isProbe) {
        await this.redis.set(circuitKey, 'open', 'PX', cooldown);
        await this.redis.set(
          `tracking:geocode:circuit:${providerKey}:ever-opened`,
          '1',
        );
        await this.redis.del(failuresKey);
      }
      if (isProbe) await this.redis.del(halfOpenKey);
      this.logger.warn(
        `Geocoder unavailable; retaining textual location: ${String(error)}`,
      );
      return location;
    }
  }

  private async waitForGeocodeSlot(
    providerKey: string,
    rateLimit: number,
  ): Promise<void> {
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
