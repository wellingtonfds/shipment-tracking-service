export interface AppConfig {
  port: number;
  prefix: string;
  nodeEnv: string;
  jwtSecret: string;
  /** JWT lifetime in seconds (parsed from JWT_EXPIRES_IN, e.g. "8h"). */
  jwtExpiresIn: number;
  tracking: TrackingConfig;
}

export interface TrackingConfig {
  queueEnabled: boolean;
  workerRole: boolean;
  dispatcherRole: boolean;
  redis: {
    host?: string;
    port: number;
    password?: string;
    tls: boolean;
  };
  workerConcurrency: number;
  backoffMaxMs: number;
  dlqReplayIntervalMs: number;
  outboxPollIntervalMs: number;
  outboxRedisReconcileMs: number;
  lockTtlMs: number;
  retryWindowMs: number;
  geocoder: {
    url?: string;
    userAgent: string;
    apiKey?: string;
    rateLimit: number;
    cacheTtlSeconds: number;
    circuitFailures: number;
    circuitCooldownMs: number;
    timeoutMs: number;
  };
}

const DEFAULT_GEOCODER_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_GEOCODER_USER_AGENT =
  'shipment-tracking-tests/1.0 (contato@empresa.com)';

function parseBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function parsePositiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseOptionalUrl(name: string, fallback: string): string | undefined {
  const value = process.env[name];
  if (value === '') return undefined;
  const url = value ?? fallback;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      throw new Error('unsupported protocol');
    return parsed.toString();
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL`);
  }
}

function parseOptionalString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function trackingConfiguration(): TrackingConfig {
  const queueEnabled = parseBoolean('TRACKING_QUEUE_ENABLED', false);
  const redisHost = parseOptionalString('REDIS_HOST');
  if (queueEnabled && !redisHost)
    throw new Error('REDIS_HOST is required when TRACKING_QUEUE_ENABLED=true');

  return {
    queueEnabled,
    workerRole: parseBoolean('TRACKING_WORKER_ROLE', false),
    dispatcherRole: parseBoolean('TRACKING_DISPATCHER_ROLE', true),
    redis: {
      host: redisHost,
      port: parsePositiveInteger('REDIS_PORT', 6379),
      password: parseOptionalString('REDIS_PASSWORD'),
      tls: parseBoolean('REDIS_TLS', false),
    },
    workerConcurrency: parsePositiveInteger('TRACKING_WORKER_CONCURRENCY', 8),
    backoffMaxMs: parsePositiveInteger('TRACKING_BACKOFF_MAX_MS', 3600000),
    dlqReplayIntervalMs: parsePositiveInteger(
      'DLQ_REPLAY_INTERVAL_MS',
      86400000,
    ),
    outboxPollIntervalMs: parsePositiveInteger('OUTBOX_POLL_INTERVAL_MS', 1000),
    outboxRedisReconcileMs: parsePositiveInteger(
      'OUTBOX_REDIS_RECONCILE_MS',
      60000,
    ),
    lockTtlMs: parsePositiveInteger('TRACKING_LOCK_TTL_MS', 120000),
    retryWindowMs: parsePositiveInteger('TRACKING_RETRY_WINDOW_MS', 86400000),
    geocoder: {
      url: parseOptionalUrl('GEOCODER_URL', DEFAULT_GEOCODER_URL),
      userAgent:
        parseOptionalString('GEOCODER_USER_AGENT') ??
        DEFAULT_GEOCODER_USER_AGENT,
      apiKey: parseOptionalString('GEOCODER_API_KEY'),
      rateLimit: parsePositiveInteger('GEOCODE_RATE_LIMIT', 1),
      cacheTtlSeconds: parsePositiveInteger(
        'GEOCODER_CACHE_TTL_SECONDS',
        2592000,
      ),
      circuitFailures: parsePositiveInteger('GEOCODER_CIRCUIT_FAILURES', 5),
      circuitCooldownMs: parsePositiveInteger(
        'GEOCODER_CIRCUIT_COOLDOWN_MS',
        30000,
      ),
      timeoutMs: parsePositiveInteger('GEOCODER_TIMEOUT_MS', 3000),
    },
  };
}

function parseExpiresIn(value: string | undefined): number {
  const fallback = 8 * 3600;
  const match = /^(?<amount>\d+)(?<unit>s|m|h|d)$/.exec(
    (value ?? '').trim().toLowerCase(),
  );
  if (!match?.groups) {
    return fallback;
  }
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 } as const;
  const unit = match.groups.unit as keyof typeof multipliers;
  return Number(match.groups.amount) * multipliers[unit];
}

export default (): AppConfig => ({
  port: Number(process.env.PORT ?? 3000),
  prefix: process.env.API_PREFIX ?? 'api/v1',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtExpiresIn: parseExpiresIn(process.env.JWT_EXPIRES_IN),
  tracking: trackingConfiguration(),
});
