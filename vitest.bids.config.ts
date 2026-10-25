import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/bid-lua.test.ts',
      'apps/api/tests/bid-funding.test.ts',
      'apps/api/tests/bid-persistence.test.ts',
      'apps/api/tests/lot-closing.test.ts',
    ],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  esbuild: {
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
  },
});
