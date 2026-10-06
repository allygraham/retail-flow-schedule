import { test, expect } from '@playwright/test';
import { authenticate, businessId, ownerId, stubApi } from './fixtures';
const theme = { themeKey: 'forest', primaryColor: '#123456', secondaryColor: '#234567', accentColor: '#345678', surfaceColor: '#f0f1f2' };
test('a cached workspace palette is used on the first shell paint and stays during a slow refresh', async ({ page }) => {
  await authenticate(page); await stubApi(page);
  await page.addInitScript(({ theme, ownerId, businessId }) => {
    localStorage.setItem('lavoro:theme:v1', JSON.stringify({ version: 1, userId: ownerId, businessId, theme }));
    const colours: string[] = [];
    Object.assign(window, { shellColours: colours });
    const observe = () => {
      const shell = document.querySelector('.tenantTheme');
      if (shell) colours.push(getComputedStyle(shell).getPropertyValue('--color-primary').trim());
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  }, { theme, ownerId, businessId });
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rest/v1/business_branding*', async route => { await ready; await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ theme_key: 'forest', primary_color: '#654321' }) }); });
  try {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /Good/ })).toBeVisible();
    await expect(page.locator('.tenantTheme').first()).toHaveCSS('--color-primary', '#123456');
    await expect.poll(() => page.evaluate(() => (window as unknown as { shellColours: string[] }).shellColours.length)).toBeGreaterThan(2);
    expect(await page.evaluate(() => [...new Set((window as unknown as { shellColours: string[] }).shellColours)])).toEqual(['#123456']);
  } finally { release(); }
  await expect(page.locator('.tenantTheme').first()).toHaveCSS('--color-primary', '#654321');
});
test('another user’s cached palette is not applied', async ({ page }) => {
  await authenticate(page); await stubApi(page);
  await page.addInitScript(({ theme, businessId }) => localStorage.setItem('lavoro:theme:v1', JSON.stringify({ version: 1, userId: 'another-user', businessId, theme })), { theme, businessId });
  await page.goto('/dashboard');
  await expect(page.locator('.tenantTheme').first()).toHaveCSS('--color-primary', '#5B5FEF');
});
