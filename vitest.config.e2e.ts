import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // E2E suites share MSSQL and the Redis/BullMQ queues from docker-compose.
    // Running files concurrently lets a worker from another suite consume jobs
    // with a different overridden geocoder, making provider simulations flaky.
    fileParallelism: false,
  },
});
