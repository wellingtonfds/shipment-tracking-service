import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { coverageExclude } from './scripts/coverage-policy.js';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: coverageExclude,
      thresholds: { statements: 70 },
    },
  },
});
