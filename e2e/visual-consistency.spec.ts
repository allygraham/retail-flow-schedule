import { test, expect } from '@playwright/test';
import { authenticate, stubApi } from './fixtures';

for (const width of [390, 1280]) {
  test(`empty states follow the workspace palette and use one inset at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await authenticate(page); await stubApi(page);
    await page.route('**/rest/v1/business_branding*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ theme_key: 'forest', primary_color: '#34502b' }) }));
    await page.goto('/profile');
    const empty = page.locator('[data-empty-state]');
    await expect(empty).toContainText('No upcoming shifts');
    await expect(empty).toContainText('Your next published shifts will appear here.');
    await expect.poll(() => page.locator('.tenantTheme').first().evaluate(el => getComputedStyle(el).getPropertyValue('--color-primary'))).toBe('#34502b');
    const colours = await empty.evaluate(el => {
      const css = getComputedStyle(el);
      const probe = document.createElement('span');
      el.append(probe);
      probe.style.color = 'var(--color-text-secondary)';
      const secondary = getComputedStyle(probe).color;
      probe.style.color = 'var(--color-text-primary)';
      const primary = getComputedStyle(probe).color;
      probe.remove();
      return { actualSecondary: css.color, secondary, actualPrimary: getComputedStyle(el.firstElementChild!).color, primary, parentPadding: getComputedStyle(el.parentElement!).padding, padding: css.paddingTop };
    });
    expect(colours.actualSecondary).toBe(colours.secondary);
    expect(colours.actualPrimary).toBe(colours.primary);
    expect(colours.parentPadding).toBe('0px');
    expect(colours.padding).toBe(width === 390 ? '24px' : '32px');
    await page.screenshot({ path: test.info().outputPath('profile-empty.png'), fullPage: true });

    await page.goto('/settings');
    await page.getByRole(width === 390 ? 'tab' : 'button', { name: 'Public holidays', exact: true }).click();
    const holidayEmpty = page.locator('[data-empty-state]').filter({ hasText: 'No upcoming company holidays' });
    await expect(holidayEmpty).toBeVisible();
    await expect(holidayEmpty).toHaveCSS('font-style', 'normal');
    await page.screenshot({ path: test.info().outputPath('holiday-empty.png'), fullPage: true });
  });

  test(`Add role keeps its icon beside the label at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await authenticate(page); await stubApi(page);
    await page.goto('/settings');
    await page.getByRole(width === 390 ? 'tab' : 'button', { name: 'Job roles', exact: true }).click();
    const button = page.getByRole('button', { name: 'Add role', exact: true });
    await expect(button).toBeVisible();
    const cardBody = page.locator('form').locator('..');
    await expect(cardBody).toHaveCSS('padding-left', width === 390 ? '16px' : '20px');
    const icon = await button.locator('svg').boundingBox();
    const label = await button.locator(':scope > span').boundingBox();
    expect(icon).not.toBeNull(); expect(label).not.toBeNull();
    expect(icon!.x + icon!.width).toBeLessThanOrEqual(label!.x);
    expect(Math.abs(icon!.y + icon!.height / 2 - label!.y - label!.height / 2)).toBeLessThan(2);
    await page.screenshot({ path: test.info().outputPath('roles.png'), fullPage: true });
  });

  test(`404 uses a styled return link and returns logged-out visitors to login at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await stubApi(page);
    await page.goto('/missing-page');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    const link = page.getByRole('link', { name: 'Return to app', exact: true });
    await expect(link).toHaveCSS('display', 'inline-flex');
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: test.info().outputPath('404.png'), fullPage: true });
    await link.click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });
}
