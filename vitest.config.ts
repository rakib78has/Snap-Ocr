import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/core/**/*.ts', 'src/shared/**/*.ts', 'src/background/handlers.ts'],
      thresholds: {
        // Scoped to the pure logic layers, where a number means something.
        // DOM and Chrome wiring is covered by the e2e suite instead.
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
