import { defineConfig } from 'vitest/config';

// Real engine/queue acceptance runs after the parallel functional suites.
export default defineConfig({
  test: {
    include: ['apps/api/search-tests/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  esbuild: {
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
  },
});
