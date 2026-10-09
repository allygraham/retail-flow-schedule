import { test, expect } from '@playwright/test';
import { authenticate, stubApi } from './fixtures';
for (const width of [390, 1440]) {
  test(`returning account gets the themed workspace loading frame at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await authenticate(page); await stubApi(page);
    await page.addInitScript(() => localStorage.setItem('lavoro:theme:v1', JSON.stringify({ version: 1, userId: '11111111-1111-4111-8111-111111111111', businessId: '33333333-3333-4333-8333-333333333333', theme: { themeKey: 'topdrawer', primaryColor: '#747C61', secondaryColor: '#4C4E56', accentColor: '#747C61', surfaceColor: '#FFFFFF' } })));
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/rest/v1/memberships*', async route => { await pending; await route.fallback(); });
    await page.goto('/dashboard');
    try {
      const loader = page.locator('[data-loading-layout="workspace"]');
      await expect(loader).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: test.info().outputPath('workspace-loading.png') });
    } finally { release(); }
    await expect(page.getByRole('heading', { name: /Good/ })).toBeVisible();
    await expect(page.locator('[data-loading-layout]')).toHaveCount(0);
  });
}
