import { defineConfig } from '@playwright/test';

// eslint-disable-next-line node/no-process-env -- Playwright runner configuration
const isCi = process.env.CI !== undefined;

export default defineConfig({
  testDir: './',
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: 1,
  reporter: 'line',
  timeout: 120_000,
  use: {
    trace: 'on-first-retry',
  },
});
