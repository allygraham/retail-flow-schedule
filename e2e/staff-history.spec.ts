import { test, expect } from '@playwright/test';
import { authenticate, stubApi, employeeId, businessId } from './fixtures';

for (const width of [1280, 390]) test(`owner can open staff history and change years at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'));
  await authenticate(page);
  const state = await stubApi(page);
  state.leaves = [
    { id: 'annual-1', user_id: employeeId, business_id: businessId, leave_type: 'annual', status: 'approved', start_date: '2025-12-31', end_date: '2026-01-02', charged_working_days: [1,2,3,4,5] },
    { id: 'sick-1', user_id: employeeId, business_id: businessId, leave_type: 'sick', status: 'approved', start_date: '2026-10-02', end_date: '2026-10-05', sickness_meta: { category: 'cold_flu', return_to_work_date: '2026-10-06' }, lifecycle_status: 'returned_to_work' },
  ];
  await page.goto('/team');
  await page.getByRole('link', { name: 'Test Employee', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/team/${employeeId}$`));
  await expect(page.getByText('Cold / flu', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  await expect(page.getByText('Returned to work', { exact: true })).toBeVisible();
  await expect(page.getByText('Annual leave entitlement', { exact: true }).locator('..')).toContainText('28');
  await expect(page.getByText('Current allowance in working days per leave year')).toBeVisible();
  await expect(page.getByText('Annual leave taken', { exact: true }).locator('..')).toContainText('2');
  await page.getByLabel('Year', { exact: true }).selectOption('2025');
  await expect(page.getByText('Annual leave taken', { exact: true }).locator('..')).toContainText('1');
  await expect(page.getByText('Sickness days', { exact: true }).locator('..')).toContainText('0');
  await expect(page.getByText('Cold / flu', { exact: true })).toHaveCount(0);
});

for (const role of ['employee', 'manager']) test(`${role} cannot open staff history by direct URL`, async ({ page }) => {
  await authenticate(page); await stubApi(page);
  await page.route('**/rest/v1/user_roles*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ role }]) }));
  let reads = 0;
  page.on('request', request => { if (request.url().includes('/get_leave_requests')) reads++; });
  await page.goto(`/team/${employeeId}`);
  await expect(page.getByText('Access denied', { exact: true })).toBeVisible();
  expect(reads).toBe(0);
});

test('owner cannot load history for someone outside the workspace', async ({ page }) => {
  await authenticate(page); await stubApi(page);
  const stranger = '99999999-9999-4999-8999-999999999999';
  await page.route(`**/rest/v1/memberships*`, route => new URL(route.request().url()).searchParams.get('user_id') === `eq.${stranger}`
    ? route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }) : route.fallback());
  let reads = 0;
  page.on('request', request => { if (request.url().includes('/get_leave_requests')) reads++; });
  await page.goto(`/team/${stranger}`);
  await expect(page.getByRole('alert')).toContainText('Could not load this staff member');
  expect(reads).toBe(0);
});
