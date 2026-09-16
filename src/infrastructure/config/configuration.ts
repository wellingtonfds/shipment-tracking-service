export interface AppConfig {
  port: number;
  prefix: string;
  nodeEnv: string;
}

export default (): AppConfig => ({
  port: Number(process.env.PORT ?? 3000),
  prefix: process.env.API_PREFIX ?? 'api/v1',
  nodeEnv: process.env.NODE_ENV ?? 'development',
});
