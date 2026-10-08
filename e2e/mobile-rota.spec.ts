import { test, expect } from '@playwright/test';
import { authenticate, stubApi, employeeId, ownerId, businessId, storeId, shiftId } from './fixtures';

const shift = (date: string, extra: Record<string, unknown> = {}) => ({ id: `${shiftId}-${date}`, business_id: businessId, store_id: storeId, role_id: null, assigned_user_id: employeeId, shift_date: date, start_time: '09:00:00', end_time: '17:00:00', break_minutes: 30, status: 'scheduled', is_published: true, notes: 'Bring your keys', ...extra });
for (const width of [320, 390, 430, 700]) {
  test(`staff can scan all seven days and open read-only details at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z'));
    await authenticate(page, employeeId); const state = await stubApi(page);
    state.shifts = [shift('2026-10-05'), shift('2026-10-08'), shift('2026-10-09', { end_time: '13:00:00', break_minutes: 0 }), shift('2026-10-10', { id: 'hidden-draft', is_published: false }), shift('2026-10-06', { id: 'another-person', assigned_user_id: ownerId })];
    // A published-week marker is independent of the deliberately overbroad mocked shift response.
    await page.route('**/rest/v1/rpc/get_rota_week_status', route => route.fulfill({ json: [{ store_id: storeId, is_published: true }] }));
    state.leaves = [{ id: 'annual', business_id: businessId, user_id: employeeId, start_date: '2026-10-07', end_date: '2026-10-07', leave_type: 'annual', status: 'approved', source: 'manager_created', charged_working_days: [1, 2, 3, 4, 5], reason: 'Family day' }];
    await page.goto('/rota');
    const agenda = page.getByRole('list', { name: 'Test Employee full week' });
    await expect(agenda.locator(':scope > li')).toHaveCount(7);
    await expect(page.getByText('19 scheduled hours', { exact: true })).toBeVisible();
    await expect(agenda.getByText('Day off', { exact: true })).toHaveCount(3);
    await expect(page.getByRole('combobox', { name: 'Rota day' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Mobile rota view' })).toHaveCount(0);
    await expect(page.locator('[data-shift-id="hidden-draft"], [data-shift-id="another-person"]')).toHaveCount(0);
    const opener = agenda.locator('[data-mobile-day="2026-10-05"]').getByRole('button', { name: 'View shift 09:00–17:00' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Shift details' });
    await expect(dialog.getByText('Bring your keys')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
    await agenda.getByRole('button', { name: 'View leave details for Test Employee' }).click();
    await expect(page.getByRole('dialog', { name: 'Absence details' })).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: test.info().outputPath('staff-week.png'), fullPage: true });
  });

  test(`manager summaries expand, edit and preserve Day view at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z'));
    await authenticate(page); const state = await stubApi(page);
    state.shifts = [shift('2026-10-05', { is_published: false }), shift('2026-10-05', { id: 'second', start_time: '18:00:00', end_time: '20:00:00', break_minutes: 0, is_published: false }), shift('2026-10-06', { id: 'open', assigned_user_id: null, status: 'unassigned' })];
    await page.goto('/rota');
    const person = page.getByRole('region', { name: 'Test Employee week overview' });
    await expect(person.getByText('2 shifts', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Test Employee weekly hours')).toHaveText('9.5h');
    const expand = person.getByRole('button', { name: 'Expand week for Test Employee' });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expect(person.getByRole('list', { name: 'Test Employee full week' })).toBeHidden();
    await expand.focus(); await page.keyboard.press('Enter');
    await expect(person.getByRole('list', { name: 'Test Employee full week' }).locator(':scope > li')).toHaveCount(7);
    await person.getByRole('button', { name: 'Edit shift 18:00–20:00' }).click();
    const editor = page.getByRole('dialog', { name: 'Edit shift' });
    await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(person.getByRole('button', { name: 'Edit shift 18:00–20:00' })).toBeFocused();
    await person.getByRole('button', { name: 'Add shift for Test Employee on Wednesday 7 Oct' }).click();
    const create = page.getByRole('dialog', { name: 'New shift' });
    await expect(create.getByRole('button', { name: 'Date', exact: true })).toContainText('7 Oct 2026');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Unassigned shifts' }).getByText('1 need cover', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: test.info().outputPath('manager-week.png'), fullPage: true });
    await page.getByRole('button', { name: 'Day', exact: true }).click();
    await page.getByRole('combobox', { name: 'Rota day' }).selectOption('1');
    await expect(page.locator('[data-rota-cell="unassigned|2026-10-06"]')).toBeVisible();
    await page.getByRole('button', { name: 'Next week', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
}

test('mixed absence and shifts remain visible; loading does not invent days off', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 }); await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z'));
  await authenticate(page); const state = await stubApi(page);
  state.shifts = [shift('2026-10-05')];
  state.leaves = [{ id: 'sick', user_id: employeeId, business_id: businessId, start_date: '2026-10-05', end_date: '2026-10-05', leave_type: 'sick', status: 'approved' }];
  await page.goto('/rota'); const summary = page.getByRole('list', { name: 'Test Employee week summary' });
  await expect(summary.getByText('Work', { exact: true })).toBeVisible(); await expect(summary.getByText('Sick', { exact: true })).toBeVisible();
  await expect(summary.getByText('Conflict', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expand week for Test Employee' }).click();
  const monday = page.locator('[data-mobile-day="2026-10-05"]');
  await expect(monday.getByRole('button', { name: 'View sickness details for Test Employee' })).toBeVisible();
  await expect(monday.getByRole('button', { name: 'Edit shift 09:00–17:00' })).toBeVisible();
  const previousHeight = (await monday.boundingBox())!.height;
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rest/v1/shifts*', async route => { await wait; await route.fallback(); });
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  try {
    await expect(page.getByLabel('Weekly rota', { exact: true })).toHaveAttribute('aria-busy', 'true');
    expect((await page.locator('[data-mobile-day="2026-10-12"]').boundingBox())!.height).toBeGreaterThanOrEqual(previousHeight);
    await expect(page.getByText('Day off', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add shift for Test Employee on Wednesday 14 Oct' })).toHaveCount(0);
  } finally { release(); }
  await expect(page.getByLabel('Weekly rota', { exact: true })).toHaveAttribute('aria-busy', 'false');
});

for (const manager of [true, false]) test(`initial ${manager ? 'manager' : 'staff'} loading uses the mobile structure`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await authenticate(page, manager ? ownerId : employeeId); await stubApi(page);
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rest/v1/rpc/get_rota_people', async route => { await pending; await route.fallback(); });
  await page.goto('/rota');
  try {
    const root = page.getByLabel('Weekly rota', { exact: true });
    await expect(root).toHaveAttribute('aria-busy', 'true');
    if (manager) await expect(root.locator(':scope > div[aria-hidden="true"]')).toHaveCount(3);
    else await expect(root.locator('[data-mobile-day]')).toHaveCount(7);
    await expect(page.getByText('Day off', { exact: true })).toHaveCount(0);
    await expect(page.getByText('To be confirmed', { exact: true })).toHaveCount(0);
  } finally { release(); }
  await expect(page.getByLabel('Weekly rota', { exact: true })).toHaveAttribute('aria-busy', 'false');
});

test('manager compares several employees without exposing expansion to desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 }); await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z'));
  await authenticate(page); const state = await stubApi(page);
  const thirdId = '88888888-8888-4888-8888-888888888888';
  await page.route('**/rest/v1/rpc/get_rota_people', route => route.fulfill({ json: [
    { user_id: employeeId, id: employeeId, full_name: 'Jamie Walsh', store_ids: [storeId], primary_store_id: storeId, primary_role_id: null },
    { user_id: ownerId, id: ownerId, full_name: 'Sam Collins', store_ids: [storeId], primary_store_id: storeId, primary_role_id: null },
    { user_id: thirdId, id: thirdId, full_name: 'Priya Sharma', store_ids: [storeId], primary_store_id: storeId, primary_role_id: null },
  ] }));
  state.shifts = [shift('2026-10-05'), shift('2026-10-06', { id: 'sam', assigned_user_id: ownerId }), shift('2026-10-07', { id: 'priya', assigned_user_id: thirdId })];
  await page.goto('/rota');
  for (const name of ['Jamie Walsh', 'Sam Collins', 'Priya Sharma']) {
    await expect(page.getByRole('list', { name: `${name} week summary` }).locator(':scope > li')).toHaveCount(7);
    await expect(page.getByLabel(`${name} weekly hours`)).toHaveText('7.5h');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: test.info().outputPath('manager-overview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Expand week for Sam Collins' }).click();
  await expect(page.getByRole('list', { name: 'Sam Collins full week' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Jamie Walsh full week' })).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('group', { name: 'Mobile rota view' })).toHaveCount(0);
  await expect(page.locator('[data-rota-cell]')).toHaveCount(28);
  await expect(page.getByLabel('Sam Collins weekly hours')).toHaveText('7.5h');
});
