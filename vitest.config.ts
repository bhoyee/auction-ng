import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'apps/api/tests/**/*.test.ts'],
    exclude: ['tests/bid-lua.test.ts', 'apps/api/tests/bid-funding.test.ts'],
    maxWorkers: 4,
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      enabled: true,
      provider: 'v8',
      include: [
        'packages/shared/src/{money,auction-rules,fees,proxy,schemas}.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { perFile: true, lines: 100 },
    },
  },
  esbuild: {
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
  },
});
