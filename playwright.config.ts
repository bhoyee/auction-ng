import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const productionAudit = process.env.WEB_PERFORMANCE_CHECK === 'true';
const redesign = process.env.REDESIGN_DEMO === 'true';
const api = redesign ? 'http://localhost:4450' : 'http://localhost:4400';
const realtime = redesign ? 'http://localhost:4451' : 'http://localhost:4401';

export default defineConfig({
  testDir: redesign ? './tests/redesign' : './tests/e2e',
  outputDir: redesign
    ? './test-results/redesign'
    : productionAudit
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
        NEXT_PUBLIC_API_URL: api,
        NEXT_PUBLIC_REALTIME_URL: realtime,
        API_INTERNAL_URL: api,
        CATALOGUE_CACHE_NAMESPACE: `browser-${randomUUID()}`,
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
