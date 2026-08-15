import { defineConfig, devices } from '@playwright/test';

const isCi = 'CI' in process.env;

const parallelism = () => {
  if (isCi) return { retries: 2, workers: 1 };
  return { retries: 0 };
};

export default defineConfig({
  testDir: './',
  fullyParallel: true,
  forbidOnly: isCi,
  ...parallelism(),
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
