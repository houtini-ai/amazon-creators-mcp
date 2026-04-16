import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: false,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      // server.ts is wiring glue; exercised via scripts/smoke-stdio.ts against the real protocol.
      // index.ts is the bin shim. types/** are pure type declarations.
      exclude: ['src/index.ts', 'src/server.ts', 'src/types/**', 'src/formatters/types.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
