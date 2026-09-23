import { defineConfig, devices } from '@playwright/test';

// oxlint-disable-next-line effect/noGlobals -- the runner's one knob: a free port when 3187 is taken.
const port = Number(process.env['EGW_BROWSER_PORT'] ?? 3187);

export default defineConfig({
  testDir: '.',
  testMatch: /\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${String(port)}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'bun server.ts',
    env: { PORT: String(port) },
    url: `http://127.0.0.1:${String(port)}/__fixture/ready`,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
