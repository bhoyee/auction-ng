import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  use: { browserName: 'chromium' },
  webServer: [
    {
      command: 'pnpm --filter web exec next dev --port 3310',
      url: 'http://localhost:3310',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'pnpm --filter admin exec next dev --port 3301',
      url: 'http://localhost:3301',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
