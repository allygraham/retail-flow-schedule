import { test, expect } from '@playwright/test';
import { authenticate, stubApi, businessId, employeeId } from './fixtures';

test.use({ timezoneId: 'Europe/London' });
const leave = (overrides: Record<string, unknown> = {}) => ({ id: '66666666-6666-4666-8666-666666666666', business_id: businessId, user_id: employeeId, leave_type: 'annual', source: 'employee_request', status: 'pending', start_date: '2026-10-14', end_date: '2026-10-14', created_at: '2026-10-07T12:00:00Z', sickness_meta: null, lifecycle_status: null, reason: 'Holiday', ...overrides });

for (const width of [320, 390, 1440]) {
  test(`manager records, filters and review actions remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.clock.setFixedTime(new Date('2026-10-08T12:00:00Z'));
    await authenticate(page); const state = await stubApi(page); state.leaves = [leave()];
    await page.goto('/leave');
    const panel = page.getByRole('region', { name: 'Absence records' });
    await expect(panel.getByText('Test Employee')).toBeVisible();
    await expect(panel.getByText('14 Oct 2026', { exact: true })).toBeVisible();
    await page.getByLabel('Search employees').fill('missing');
    await expect(page.getByText('No leave & absence matches those filters')).toBeVisible();
    await page.getByLabel('Search employees').fill('');
    await expect(panel.getByText('Test Employee')).toBeVisible();
    if (width < 1024) {
      await page.getByRole('button', { name: 'Open filters' }).click();
      await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
      await page.getByRole('dialog').getByLabel('Leave type').selectOption('unpaid');
      await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click();
      await expect(page.getByText('No leave & absence matches those filters')).toBeVisible();
      await page.getByRole('button', { name: 'Clear all', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      await page.getByLabel('Leave type').selectOption('unpaid');
      await expect(page.getByText('No leave & absence matches those filters')).toBeVisible();
      await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click();
      await page.getByRole('button', { name: 'Hide filters' }).click();
    }
    await page.screenshot({ path: test.info().outputPath('manager-leave.png'), fullPage: true });
    const review = panel.getByRole('button', { name: width < 1024 ? 'Review request' : 'Approve', exact: true });
    expect((await review.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await review.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Approve request' })).toBeVisible();
    expect(state.leaves[0].status).toBe('pending');
    await page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.leaves[0].status).toBe('approved');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });

  test(`employee balance and calendar keep their meaning at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.clock.setFixedTime(new Date('2026-10-08T12:00:00Z'));
    await authenticate(page, employeeId); const state = await stubApi(page); state.role = 'employee'; state.leaves = [leave({ status: 'approved', charged_working_days: [1,2,3,4,5] })];
    await page.goto('/leave');
    await expect(page.getByRole('heading', { name: 'My time off' })).toBeVisible();
    await expect(page.getByText('Remaining', { exact: true })).toBeVisible();
    await expect(page.getByText('Taken', { exact: true })).toBeVisible();
    await expect(page.getByText('Entitlement', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Approve|Review request|Add leave/ })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('employee-leave.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
    // UK daylight saving must not move absence records to the previous date.
    const day = page.getByRole('button', { name: 'Wednesday 14 Oct 2026, 1 absence', exact: true });
    await day.click();
    await expect(page.getByText('Wednesday 14 Oct 2026', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Test Employee.*Annual leave.*Approved/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: test.info().outputPath('absence-calendar.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test('failed request loading preserves the page shell and offers retry', async ({ page }) => {
  await authenticate(page); await stubApi(page);
  await page.route('**/rest/v1/rpc/get_leave_requests*', route => route.fulfill({ status: 500, json: { message: 'Leave service unavailable' } }));
  await page.goto('/leave');
  await expect(page.getByRole('heading', { name: 'Leave & absence' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Absence views' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Could not load leave requests');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('workspace theme and keyboard view navigation remain available', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page); state.leaves = [leave()];
  await page.route('**/rest/v1/business_branding*', route => route.fulfill({ json: { business_id: businessId, theme_key: 'forest', primary_color: '#16A34A', logo_url: null, custom_tokens: null } }));
  await page.goto('/leave');
  const pending = page.getByRole('tab', { name: /^Pending/ });
  await expect(pending).toHaveAttribute('aria-selected', 'true');
  await expect(pending).toHaveCSS('color', 'rgb(22, 163, 74)');
  await pending.focus(); await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Calendar' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('themed-absence-calendar.png'), fullPage: true });
});

test('desktop keeps records panel and column headers during loading', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await authenticate(page); await stubApi(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rest/v1/rpc/get_leave_requests*', async route => { await gate; await route.fulfill({ json: [] }); });
  await page.goto('/leave');
  try {
    await expect(page.getByRole('status', { name: 'Loading leave requests' })).toBeVisible();
    for (const label of ['Employee', 'Type', 'Dates', 'Status', 'Source / impact', 'Submitted']) await expect(page.getByRole('columnheader', { name: label, exact: true })).toBeVisible();
    await expect(page.getByLabel('Search employees')).toBeVisible();
    await page.getByRole('tab', { name: 'Calendar' }).click();
    await expect(page.getByRole('status', { name: 'Loading day absences' })).toBeVisible();
    await expect(page.getByText('No absences on this day.')).toHaveCount(0);
    await page.getByRole('tab', { name: /^Pending/ }).click();
  } finally { release(); }
  await expect(page.getByText('All caught up')).toBeVisible();
});
