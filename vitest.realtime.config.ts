import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'apps/realtime/tests/**/*.test.ts',
      'apps/api/tests/realtime.test.ts',
    ],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
  esbuild: {
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
  },
});
