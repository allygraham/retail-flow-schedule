import { test, expect, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { authenticate, stubApi } from '../e2e/fixtures';

// Gzip JS budgets protect download cost deterministically; timing budgets allow CI variance.
const scenarios = [
  { path: '/login', signedIn: false, heading: 'Welcome back', loading: '', jsKiB: 145, readyMs: 5000, lcpMs: 4500 },
  { path: '/dashboard', signedIn: true, heading: /Good/, loading: 'Loading dashboard', jsKiB: 195, readyMs: 6500, lcpMs: 5500 },
  { path: '/rota', signedIn: true, heading: /Week of/, loading: 'Loading rota', jsKiB: 230, readyMs: 7500, lcpMs: 6500 },
];
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

for (const scenario of scenarios) test(`${scenario.path} stays within mobile loading budgets`, async ({ browser }, testInfo) => {
  const samples: { readyMs: number; lcpMs: number; jsKiB: number; assets: string[] }[] = [];
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({ ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:4175', serviceWorkers: 'block' });
    try {
      const page = await context.newPage();
      await stubApi(page);
      if (scenario.signedIn) await authenticate(page);
      await page.route('**/_vercel/**', route => route.abort());
      await page.route(url => url.hostname !== '127.0.0.1' && url.hostname !== 'example.supabase.co', route => route.abort());
      await page.addInitScript(() => {
        const readings = { lcp: 0 };
        Object.assign(window, { mobilePerformance: readings });
        new PerformanceObserver(list => { for (const entry of list.getEntries()) readings.lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 });
      const assets = new Set<string>();
      const errors: string[] = [];
      page.on('response', response => { if (new URL(response.url()).pathname.startsWith('/assets/') && !response.ok()) errors.push(`Asset failed: ${response.status()} ${response.url()}`); });
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { const url = new URL(request.url()); if (url.hostname === '127.0.0.1' && url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js')) assets.add(url.pathname); });
      await page.goto(scenario.path);
      await expect(page.getByRole('heading', { name: scenario.heading })).toBeVisible();
      if (scenario.signedIn) {
        await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
        if (scenario.path === '/rota') await expect(page.getByLabel('Weekly rota', { exact: true })).toHaveAttribute('aria-busy', 'false');
        await expect(page.getByRole('status', { name: scenario.loading, exact: true })).toHaveCount(0);
      } else await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
      const readyMs = await page.evaluate(() => performance.now());
      // Allow paint observer delivery and late initial imports before freezing the measurement.
      await page.waitForTimeout(500);
      const lcpMs = await page.evaluate(() => (window as unknown as { mobilePerformance: { lcp: number } }).mobilePerformance.lcp);
      expect(errors).toEqual([]);
      expect(lcpMs, 'LCP observation must be present').toBeGreaterThan(0);
      const jsKiB = [...assets].reduce((total, asset) => total + gzipSync(readFileSync(resolve('dist', `.${asset}`))).length, 0) / 1024;
      samples.push({ readyMs, lcpMs, jsKiB, assets: [...assets] });
    } finally { await context.close(); }
  }
  const result = { path: scenario.path, budgets: scenario, samples, medianReadyMs: median(samples.map(s => s.readyMs)), medianLcpMs: median(samples.map(s => s.lcpMs)), maxJsKiB: Math.max(...samples.map(s => s.jsKiB)) };
  await testInfo.attach('mobile-loading.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  console.log(JSON.stringify(result));
  expect(result.maxJsKiB, 'initial gzip JavaScript budget').toBeLessThanOrEqual(scenario.jsKiB);
  expect(result.medianReadyMs, 'median route ready budget').toBeLessThanOrEqual(scenario.readyMs);
  expect(result.medianLcpMs, 'median LCP budget').toBeLessThanOrEqual(scenario.lcpMs);
});
