import { test, expect } from '@playwright/test';
import { authenticate, stubApi, businessId, employeeId, shiftId, storeId } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z'));
  await authenticate(page);
});

const shift = (overrides: Record<string, unknown> = {}) => ({ id: shiftId, business_id: businessId, store_id: storeId, role_id: 'role-floor', assigned_user_id: employeeId, shift_date: '2026-10-05', start_time: '09:00:00', end_time: '17:00:00', break_minutes: 30, status: 'scheduled', is_published: false, updated_at: '2026-10-04T00:00:00Z', ...overrides });

test('desktop keeps scheduled hours pinned and marks today with truthful daily counts', async ({ page }) => {
  const state = await stubApi(page);
  state.shifts = [shift(), shift({ id: 'second', start_time: '18:00:00', end_time: '19:00:00', break_minutes: 0 }), shift({ id: 'open', assigned_user_id: null }), shift({ id: 'cancelled', assigned_user_id: null, status: 'cancelled' })];
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/rota');
  await expect(page.getByLabel('Summary for 2026-10-05')).toHaveText('1 scheduled1 open');
  await expect(page.locator('[data-today="true"]')).toContainText('Today');
  const total = page.getByLabel('Test Employee weekly hours');
  await expect(total).toHaveText('8.5h');
  expect(await total.evaluate(el => getComputedStyle(el).position)).toBe('sticky');
  const grid = page.getByLabel('Weekly rota');
  const before = await total.boundingBox();
  await grid.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  const after = await total.boundingBox();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
  await grid.evaluate(el => { el.scrollLeft = 0; });
  await page.screenshot({ path: test.info().outputPath('desktop-rota.png'), fullPage: true });
});

test('shift and add-another controls work with keyboard, including empty cells', async ({ page }) => {
  const state = await stubApi(page); state.shifts = [shift()];
  await page.goto('/rota');
  const cell = page.locator(`[data-rota-cell="${employeeId}|2026-10-05"]`);
  const edit = cell.getByRole('button', { name: /09:00/ });
  await edit.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit shift' })).toBeVisible();
  await page.keyboard.press('Escape');
  const add = cell.getByRole('button', { name: 'Add shift for Test Employee on 2026-10-05' });
  await add.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'New shift' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add shift for Test Employee on 2026-10-06' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'New shift' })).toBeVisible();
  expect(state.writes.filter(write => !write.endpoint.startsWith('get_'))).toHaveLength(0);
});

test('employee search and primary-role filter narrow rows without hiding operational totals', async ({ page }) => {
  const state = await stubApi(page); state.shifts = [shift()];
  await page.route('**/rest/v1/roles_catalog*', route => route.fulfill({ json: [{ id: 'role-floor', name: 'Floor', color: '#336699', business_id: businessId }, { id: 'role-manager', name: 'Manager', color: '#884488', business_id: businessId }] }));
  await page.route('**/rest/v1/rpc/get_rota_people', route => route.fulfill({ json: [{ user_id: employeeId, full_name: 'Test Employee', primary_store_id: storeId, primary_role_id: 'role-floor', store_ids: [storeId] }, { user_id: 'other', full_name: 'Alex Manager', primary_store_id: storeId, primary_role_id: 'role-manager', store_ids: [storeId] }] }));
  await page.goto('/rota');
  await expect(page.getByRole('button', { name: /09:00/ })).toContainText('Floor');
  await page.getByLabel('Search employees').fill('alex');
  await expect(page.locator(`[data-rota-cell="${employeeId}|2026-10-05"]`)).toHaveCount(0);
  await expect(page.getByLabel('Summary for 2026-10-05')).toHaveText('1 scheduled');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Filter by primary role').selectOption('role-floor');
  await expect(page.locator('[data-rota-cell="other|2026-10-05"]')).toHaveCount(0);
  await page.getByLabel('Search employees').fill('missing');
  await expect(page.getByText('No employees match these filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('[data-rota-cell="other|2026-10-05"]')).toBeVisible();
});


test('highlighted sticky name and hours columns remain opaque while scrolling', async ({ page }) => {
  const state = await stubApi(page); state.shifts = [shift()];
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/rota');
  const grid = page.getByLabel('Weekly rota');
  await expect(grid).toHaveAttribute('aria-busy', 'false');
  // Exercise a translucent workspace highlight, including keyboard focus.
  await grid.evaluate(el => { (el as HTMLElement).style.setProperty('--color-row-hover', 'rgba(100, 80, 200, 0.12)'); });
  const row = page.getByLabel('Test Employee weekly hours').locator('..');
  const name = row.locator(':scope > div').first();
  const hours = page.getByLabel('Test Employee weekly hours');
  const edit = row.getByRole('button', { name: /09:00/ });
  await edit.focus();
  await grid.evaluate(el => { el.scrollLeft = 250; });
  for (const pinned of [name, hours]) {
    const style = await pinned.evaluate(el => {
      const css = getComputedStyle(el);
      return { base: css.backgroundColor, highlight: css.backgroundImage };
    });
    expect(style.base).toMatch(/^rgb\(/);
    expect(style.highlight).toContain('linear-gradient');
  }
  await hours.hover();
  await edit.evaluate(el => (el as HTMLElement).blur());
  for (const pinned of [name, hours]) {
    await expect(pinned).toHaveCSS('background-image', /linear-gradient/);
    expect(await pinned.evaluate(el => getComputedStyle(el).backgroundColor)).toMatch(/^rgb\(/);
  }
  await page.screenshot({ path: test.info().outputPath('highlighted-sticky-columns.png'), fullPage: true });
});


test('Today badge sits beside the date and the column uses an outline without a tint', async ({ page }) => {
  await stubApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/rota');
  await expect(page.getByLabel('Weekly rota')).toHaveAttribute('aria-busy', 'false');
  const header = page.locator('[data-today="true"]');
  const badge = header.getByText('Today', { exact: true });
  const date = header.getByText('5 Oct', { exact: true });
  const badgeBox = await badge.boundingBox();
  const dateBox = await date.boundingBox();
  expect(badgeBox!.x).toBeGreaterThanOrEqual(dateBox!.x + dateBox!.width);
  expect(Math.abs((badgeBox!.y + badgeBox!.height / 2) - (dateBox!.y + dateBox!.height / 2))).toBeLessThan(2);
  const todayCell = page.locator(`[data-rota-cell="${employeeId}|2026-10-05"]`);
  const tomorrowCell = page.locator(`[data-rota-cell="${employeeId}|2026-10-06"]`);
  expect(await todayCell.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await tomorrowCell.evaluate(el => getComputedStyle(el).backgroundColor));
  expect(await todayCell.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none');
  for (const day of ['2026-10-10', '2026-10-11']) {
    const weekend = page.locator(`[data-rota-cell="${employeeId}|${day}"]`);
    expect(await weekend.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await tomorrowCell.evaluate(el => getComputedStyle(el).backgroundColor));
  }
  await page.screenshot({ path: test.info().outputPath('today-column-outline.png'), fullPage: true });
});
