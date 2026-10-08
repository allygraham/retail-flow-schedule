import { test, expect } from '@playwright/test';
import { authenticate, stubApi, employeeId, businessId, storeId } from './fixtures';

for (const width of [320, 390, 1280]) test(`theme presets are selectable and details expandable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await authenticate(page); await stubApi(page);
  await page.goto('/settings');
  await page.getByRole(width < 900 ? 'tab' : 'button', { name: 'Theme', exact: true }).click();
  const forest = page.getByRole('button', { name: 'Forest', exact: true });
  await expect(forest).toBeVisible(); await forest.click();
  await expect(forest).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Save theme', exact: true })).toBeEnabled();
  const details = page.locator('details');
  await expect(details).not.toHaveAttribute('open');
  await expect(page.getByText('Workspace logo', { exact: true })).not.toBeVisible();
  if (width < 900) {
    const presets = page.getByRole('button', { name: /^(Default|Midnight|Forest|Sunset|Slate|Top Drawer)$/ });
    const first = await presets.nth(0).boundingBox(); const second = await presets.nth(1).boundingBox();
    expect(first!.y).toBe(second!.y); expect(second!.x).toBeGreaterThan(first!.x);
    expect((await presets.nth(5).boundingBox())!.y - first!.y).toBeLessThan(350);
  }
  await details.locator('summary').click();
  await expect(page.getByText('Workspace logo', { exact: true })).toBeVisible();
  await details.locator('summary').click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Default', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tenantTheme').first()).toHaveCSS('--color-primary', '#5B5FEF');
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  await page.screenshot({ path: test.info().outputPath('theme.png'), fullPage: true });
});

test('rota scroll cues track each edge and disappear when all columns fit', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await authenticate(page); await stubApi(page);
  await page.goto('/rota');
  const right = page.getByRole('button', { name: 'Scroll rota columns and totals right' });
  const left = page.getByRole('button', { name: 'Scroll rota columns and totals left' });
  await expect(right).toBeEnabled(); await expect(left).toBeDisabled(); await right.click();
  await expect(left).toBeEnabled(); await expect(right).toBeDisabled();
  await left.click(); await expect(left).toBeDisabled(); await expect(right).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('rota-cues.png'), fullPage: true });
  await page.setViewportSize({ width: 2200, height: 900 });
  await expect(right).toHaveCount(0);
});

test('mobile settings cues reveal hidden tabs and track scrolling back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 }); await authenticate(page); await stubApi(page);
  await page.goto('/settings');
  const right = page.getByRole('button', { name: 'Scroll settings right' });
  const left = page.getByRole('button', { name: 'Scroll settings left' });
  await expect(right).toBeEnabled(); await expect(left).toBeDisabled(); await right.click();
  await expect(left).toBeEnabled(); await expect(right).toBeDisabled();
  await page.getByRole('tab', { name: 'Theme', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Forest', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('settings-cues.png'), fullPage: true });
});

test('dashboard emphasis reflects actionable work and stays quiet at zero', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page);
  await page.goto('/dashboard'); await expect(page.getByText('All caught up', { exact: true })).toBeVisible();
  await expect(page.locator('[data-attention]')).toHaveCount(0);
  state.leaves = [{ id: 'pending-leave', business_id: businessId, user_id: employeeId, leave_type: 'annual', status: 'pending', start_date: '2099-01-01', end_date: '2099-01-01', created_at: '2026-10-01' }];
  state.shifts = [{ id: 'gap', business_id: businessId, store_id: storeId, assigned_user_id: null, shift_date: '2099-01-01', start_time: '09:00:00', end_time: '17:00:00', status: 'unassigned', is_published: false }];
  await page.reload(); await expect(page.locator('[data-attention]')).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath('dashboard-attention.png'), fullPage: true });
});

test('shift operational metadata is readable and the information banner uses a vector icon', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page);
  state.shifts = [{ id: 'readable-shift', business_id: businessId, store_id: storeId, assigned_user_id: employeeId, shift_date: '2026-10-05', start_time: '09:00:00', end_time: '17:00:00', status: 'scheduled', is_published: true, updated_at: '2026-10-01', break_minutes: 30 }];
  await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z')); await page.goto('/rota');
  const shift = page.locator('[data-shift-id="readable-shift"]');
  await expect(shift).toBeVisible();
  const metadata = shift.locator('div').filter({ hasText: /^7.5h$/ }).last();
  await expect(metadata).toHaveCSS('font-size', '12px');
  state.shifts = []; await page.reload();
  const banner = page.getByText('No shifts this week — click any cell to add one.').locator('..');
  await expect(banner.locator('svg')).toBeVisible(); await expect(banner).not.toContainText('ℹ');
});
