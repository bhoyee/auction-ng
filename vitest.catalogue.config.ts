import { defineConfig } from 'vitest/config';

// A mandatory second test phase measures the local budget without unrelated
// concurrency suites competing for the same PostgreSQL/CPU resources.
export default defineConfig({
  test: {
    include: ['apps/api/performance/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  esbuild: {
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
  },
});
