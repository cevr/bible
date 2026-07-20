import { defineConfig, devices } from '@playwright/test';

const isCi = process.env.CI !== undefined;
let retries = 0;
let workers: number | undefined;
if (isCi) {
  retries = 2;
  workers = 1;
}

export default defineConfig({
  testDir: './',
  fullyParallel: true,
  forbidOnly: isCi,
  retries,
  workers,
  reporter: 'html',
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 12'] } },
  ],
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !isCi,
  },
});
