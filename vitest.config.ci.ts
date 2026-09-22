import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      reporters: ['default', 'junit'],
      outputFile: {
        junit: './reports/junit.xml',
      },
      coverage: {
        reporter: ['text', 'html', 'lcov'],
        reportsDirectory: './coverage',
      },
    },
  }),
);
