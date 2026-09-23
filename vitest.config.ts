import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

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
      exclude: [
        'src/generated/**',
        'src/**/*.spec.ts',
        'src/infrastructure/http/tracking/dtos/mark-shipment-delivered.dto.ts',
        'src/infrastructure/http/tracking/dtos/update-shipment-location.dto.ts',
        'src/infrastructure/http/tracking/dtos/update-shipment-status.dto.ts',
        'src/infrastructure/http/tracking/dtos/add-shipment-event.dto.ts',
        'src/infrastructure/http/tracking/dtos/create-shipment.dto.ts',
      ],
      thresholds: { statements: 70 },
    },
  },
});
