import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './performance',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  outputDir: 'performance-results',
  reporter: [['list'], ['json', { outputFile: 'performance-results/results.json' }]],
  use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile-chromium' }],
  webServer: { command: 'node scripts/serve-performance.mjs', url: 'http://127.0.0.1:4175', reuseExistingServer: false },
});
