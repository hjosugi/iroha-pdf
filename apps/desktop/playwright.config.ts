import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  // The memory probe deliberately pushes until the renderer is killed, which takes the
  // whole browser down and strands every test after it. It also writes hundreds of
  // megabytes of fixtures. Run it on purpose:
  //   npx playwright test memory-probe --project=chromium
  testIgnore: '**/memory-probe.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  // The PDF engine is WASM; give it room on a cold cache without hiding real hangs.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
