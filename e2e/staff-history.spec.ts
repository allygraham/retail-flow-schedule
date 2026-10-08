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
  const staffLink = page.getByRole('link', { name: 'Test Employee', exact: true });
  await expect(staffLink.getByText('employee@example.test', { exact: true })).toBeVisible();
  await staffLink.getByText('employee@example.test', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/team/${employeeId}$`));
  await expect(page.getByText('Cold / flu', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  await expect(page.getByText('Returned to work', { exact: true })).toBeVisible();
  await expect(page.getByText('Annual leave entitlement', { exact: true })).toHaveCount(0);
  for (const label of ['Taken', 'Booked', 'Pending']) {
    await expect(page.getByText(label, { exact: true }).locator('..')).toContainText('/ 28');
  }
  const sicknessDays = await page.getByText('Sickness days', { exact: true }).locator('..').boundingBox();
  const sicknessSpells = await page.getByText('Sickness spells', { exact: true }).locator('..').boundingBox();
  expect(sicknessDays?.y).toBe(sicknessSpells?.y);
  if (width === 1280) {
    const annualSummary = await page.locator('section[aria-labelledby="leave-summary-title"]').boundingBox();
    const annualRecord = await page.getByRole('region', { name: 'Annual leave record', exact: true }).boundingBox();
    const sickSummary = await page.locator('section[aria-labelledby="sickness-summary-title"]').boundingBox();
    expect(annualSummary?.x).toBe(annualRecord?.x);
    expect(annualSummary?.width).toBeCloseTo(annualRecord!.width, 0);
    expect(annualSummary?.width).toBeCloseTo(sickSummary!.width, 0);
  }
  if (width === 390) {
    const annualSummary = await page.locator('section[aria-labelledby="leave-summary-title"]').boundingBox();
    const annualRecord = await page.getByRole('region', { name: 'Annual leave record', exact: true }).boundingBox();
    const sickSummary = await page.locator('section[aria-labelledby="sickness-summary-title"]').boundingBox();
    const sickRecord = await page.getByRole('region', { name: 'Sickness record', exact: true }).boundingBox();
    expect(annualRecord!.width).toBeCloseTo(annualSummary!.width, 0);
    expect(sickRecord!.width).toBeCloseTo(annualSummary!.width, 0);
    expect(annualRecord!.y).toBeGreaterThan(annualSummary!.y + annualSummary!.height);
    expect(sickSummary!.y).toBeGreaterThan(annualRecord!.y + annualRecord!.height);
    expect(sickRecord!.y).toBeGreaterThan(sickSummary!.y + sickSummary!.height);
  }
  await expect(page.getByText('Allowance shown is the current entitlement in working days per leave year.')).toBeVisible();
  await expect(page.getByText('Taken', { exact: true }).locator('..')).toContainText('2');
  await page.getByLabel('Year', { exact: true }).selectOption('2025');
  await expect(page.getByText('Taken', { exact: true }).locator('..')).toContainText('1');
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

for (const width of [1280, 390]) test(`owner opens staff leave details from the row menu at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await authenticate(page); await stubApi(page);
  await page.goto('/team');
  await page.getByRole('button', { name: 'Open actions for Test Employee' }).click();
  await page.getByRole('menuitem', { name: 'View leave details', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/team/${employeeId}$`));
  await expect(page.getByText('Taken', { exact: true }).locator('..')).toContainText('/ 28');
});

for (const width of [1280, 390]) test(`owner records leave for this staff member at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'));
  await authenticate(page); const state = await stubApi(page);
  await page.goto(`/team/${employeeId}`);
  await page.getByRole('button', { name: 'Add leave', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add leave for Test Employee' });
  await dialog.getByLabel('Leave type', { exact: true }).selectOption('annual');
  await dialog.getByLabel('Reason', { exact: true }).fill('Recorded from staff history');
  await dialog.getByRole('button', { name: 'Save as approved' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Recorded from staff history', { exact: true })).toBeVisible();
  expect(state.writes.find(write => write.endpoint === 'record_employee_leave')?.body).toMatchObject({ _business_id: businessId, _user_id: employeeId, _leave_type: 'annual', _start_date: '2026-10-07', _end_date: '2026-10-07' });
  await expect(page.getByText('Taken', { exact: true }).locator('..')).toContainText('1');
});

test('failed staff leave save retains the draft and retries without duplicating records', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page);
  let fail = true;
  await page.route('**/rest/v1/rpc/record_employee_leave*', route => fail ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Leave could not be saved' }) }) : route.fallback());
  await page.goto(`/team/${employeeId}`);
  await page.getByRole('button', { name: 'Add leave', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add leave for Test Employee' });
  await dialog.getByLabel('Reason', { exact: true }).fill('Keep this draft');
  await dialog.getByRole('button', { name: 'Save as approved' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Leave could not be saved');
  await expect(dialog.getByLabel('Reason', { exact: true })).toHaveValue('Keep this draft');
  expect(state.leaves).toHaveLength(0);
  fail = false;
  await dialog.getByRole('button', { name: 'Save as approved' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Keep this draft', { exact: true })).toBeVisible();
  expect(state.leaves).toHaveLength(1);
});
