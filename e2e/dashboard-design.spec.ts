import { test, expect } from '@playwright/test';
import { authenticate, stubApi, businessId, employeeId, ownerId, storeId } from './fixtures';

for (const width of [320, 390, 1440]) {
  test(`manager dashboard hierarchy and actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date('2026-10-08T10:00:00Z'));
    await authenticate(page); const state = await stubApi(page);
    state.leaves = [{ id: 'pending', business_id: businessId, user_id: employeeId, leave_type: 'annual', status: 'pending', start_date: '2026-11-28', end_date: '2026-11-28' }];
    state.shifts = [
      { id: 'today', business_id: businessId, store_id: storeId, assigned_user_id: employeeId, shift_date: '2026-10-08', start_time: '09:00:00', end_time: '17:00:00', status: 'scheduled', is_published: true },
      { id: 'gap', business_id: businessId, store_id: storeId, assigned_user_id: null, shift_date: '2026-10-09', start_time: '09:00:00', end_time: '17:00:00', status: 'unassigned', is_published: true, store_locations: { name: 'Main Store' }, roles_catalog: { name: 'Sales assistant' } },
    ];
    await page.goto('/dashboard');
    await expect(page.locator('[data-attention]')).toHaveCount(2);
    const today = page.locator('[data-dashboard-panel="today"]');
    const requests = page.locator('[data-dashboard-panel="requests"]');
    const coverage = page.locator('[data-dashboard-panel="coverage"]');
    await expect(requests.getByText('Annual leave', { exact: false })).toBeVisible();
    const metrics = await page.getByRole('group', { name: 'Staffing overview' }).locator('[data-stat]').all();
    const metricBoxes = await Promise.all(metrics.map(el => el.boundingBox()));
    if (width >= 1000) for (const box of metricBoxes) expect(box!.y).toBe(metricBoxes[0]!.y);
    const boxes = await Promise.all([today, requests, coverage].map(el => el.boundingBox()));
    if (width < 1000) {
      expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
      expect(boxes[2]!.y).toBeLessThan(boxes[0]!.y);
    } else {
      expect(boxes[0]!.y).toBe(boxes[1]!.y);
      expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
    }
    for (const link of [requests.getByRole('link', { name: 'Review requests' }), coverage.getByRole('link', { name: 'View rota' })]) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: test.info().outputPath('manager-dashboard.png'), fullPage: true });
    await requests.getByRole('link', { name: 'Review requests' }).click();
    await expect(page).toHaveURL(/\/leave$/);
  });

  test(`employee cards keep entitlement visible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await authenticate(page, employeeId); await stubApi(page);
    await page.goto('/profile');
    await expect(page.getByText('Entitlement', { exact: true })).toBeVisible();
    await expect(page.getByRole('progressbar')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: test.info().outputPath('employee-balance.png'), fullPage: true });
    await page.goto('/dashboard');
    await expect(page.getByText('No upcoming shifts', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Review requests' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: test.info().outputPath('employee-dashboard.png'), fullPage: true });
  });
}

test('dashboard cards inherit workspace colours', async ({ page }) => {
  await authenticate(page, ownerId); await stubApi(page);
  await page.route('**/rest/v1/business_branding*', route => route.fulfill({ json: { business_id: businessId, theme_key: 'forest', primary_color: '#16A34A', logo_url: null, custom_tokens: null } }));
  await page.goto('/dashboard');
  await expect(page.getByText('Fully covered', { exact: true })).toBeVisible();
  await expect(page.locator('.tenantTheme').first()).toHaveCSS('--color-primary', '#16A34A');
  const colours = await page.getByRole('group', { name: 'Staffing overview' }).locator('[data-stat]').first().evaluate(el => {
    const probe = document.createElement('span'); probe.style.backgroundColor = 'var(--color-surface)'; el.append(probe);
    const result = { actual: getComputedStyle(el).backgroundColor, expected: getComputedStyle(probe).backgroundColor }; probe.remove(); return result;
  });
  expect(colours.actual).toBe(colours.expected);
  await page.screenshot({ path: test.info().outputPath('themed-dashboard.png'), fullPage: true });
});
