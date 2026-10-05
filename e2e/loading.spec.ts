import { test, expect } from '@playwright/test';
import { authenticate, stubApi } from './fixtures';

for (const scenario of [
  { path: '/profile', endpoint: 'shifts', label: 'Loading profile', heading: 'Your details' },
  { path: '/stores', endpoint: 'store_locations', label: 'Loading stores', heading: 'Your locations' },
  { path: '/dashboard', endpoint: 'shifts', label: 'Loading dashboard', heading: /Good/ },
  { path: '/rota', endpoint: 'get_rota_people', label: 'Loading rota', heading: /Week of/ },
  { path: '/team', endpoint: 'employee_profiles', label: 'Loading team', heading: 'Your people' },
]) test(`${scenario.path} shows a skeleton until its data is ready`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page); await stubApi(page);
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.hostname === 'example.supabase.co' && url.pathname.endsWith(`/${scenario.endpoint}`), async route => { await ready; await route.fallback(); });
  await page.goto(scenario.path);
  const skeleton = page.getByRole('status', { name: scenario.label, exact: true });
  try {
    await expect(skeleton).toBeVisible();
    await expect(skeleton).toHaveAttribute('aria-busy', 'true');
    await page.screenshot({ path: test.info().outputPath('loading.png') });
    await expect(skeleton.getByRole('button')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  } finally { release(); }
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByRole('heading', { name: scenario.heading })).toBeVisible();
});
