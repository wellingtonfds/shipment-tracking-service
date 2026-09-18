export interface AppConfig {
  port: number;
  prefix: string;
  nodeEnv: string;
  jwtSecret: string;
  /** JWT lifetime in seconds (parsed from JWT_EXPIRES_IN, e.g. "8h"). */
  jwtExpiresIn: number;
}

function parseExpiresIn(value: string | undefined): number {
  const fallback = 8 * 3600;
  const match = /^(?<amount>\d+)(?<unit>s|m|h|d)$/.exec((value ?? '').trim().toLowerCase());
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
});
