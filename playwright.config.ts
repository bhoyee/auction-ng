import { defineConfig } from '@playwright/test';
const productionAudit = process.env.WEB_PERFORMANCE_CHECK === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: productionAudit
    ? './test-results/production'
    : './test-results/browser',
  fullyParallel: true,
  use: { browserName: 'chromium' },
  webServer: [
    {
      command: productionAudit
        ? 'pnpm --filter web exec next start --port 3310'
        : 'pnpm --filter web exec next dev --port 3310',
      url: 'http://localhost:3310',
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        NEXT_PUBLIC_API_URL: 'http://localhost:4400',
        NEXT_PUBLIC_REALTIME_URL: 'http://localhost:4401',
        API_INTERNAL_URL: 'http://localhost:4400',
      },
    },
    {
      command: 'pnpm --filter admin exec next dev --port 3301',
      url: 'http://localhost:3301',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
