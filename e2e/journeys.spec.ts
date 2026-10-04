import { test, expect } from '@playwright/test';
import { authenticate, stubApi, businessId, employeeId, shiftId, storeId } from './fixtures';

test('workspace signup waits for email confirmation before creating a business', async ({ page }) => {
  const state = await stubApi(page);
  state.hasWorkspace = false;
  await page.goto('/signup');
  const inputs = page.locator('form input');
  await inputs.nth(0).fill('Test Owner');
  await inputs.nth(1).fill('Test Shop');
  await inputs.nth(2).fill('owner@example.test');
  await inputs.nth(3).fill('BrowserTestPassword123!');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  expect(state.writes.some(write => write.endpoint === 'bootstrap_business')).toBe(false);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.locator('input[type=email]').fill('owner@example.test');
  await page.locator('input[type=password]').fill('BrowserTestPassword123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Finish creating your workspace' })).toBeVisible();
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('heading', { name: /Good .*Test/ })).toBeVisible();
  expect(state.writes.find(write => write.endpoint === 'bootstrap_business')?.body._name).toBe('Test Shop');
});

test('invited employee confirms email, signs in and joins the intended workspace', async ({ page }) => {
  const state = await stubApi(page);
  await page.goto('/accept-invite?token=test-invite');
  await page.locator('input[type=password]').fill('BrowserTestPassword123!');
  await page.getByRole('button', { name: 'Activate account' }).click();
  await expect(page.getByRole('status')).toContainText('Check your email');
  expect(state.writes.some(write => write.endpoint === 'accept_invitation')).toBe(false);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.locator('input[type=email]').fill('owner@example.test');
  await page.locator('input[type=password]').fill('BrowserTestPassword123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Join team' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: /Good .*Test/ })).toBeVisible();
  expect(state.writes.find(write => write.endpoint === 'accept_invitation')?.body).toEqual({ _token: 'test-invite' });
});

test('holiday loading failure blocks scheduling and retries safely', async ({ page }) => {
  await authenticate(page);
  const state = await stubApi(page);
  state.holidayFailure = true;
  await page.goto('/rota');
  await expect(page.getByRole('alert')).toContainText('Could not load company holidays');
  await expect(page.getByRole('button', { name: /^Publish/ })).toHaveCount(0);
  state.holidayFailure = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: /Week of/ })).toBeVisible();
});

test('notification failures show errors and failed saves retain unread state', async ({ page }) => {
  await authenticate(page);
  const state = await stubApi(page);
  state.notificationFailure = true;
  await page.goto('/rota');
  await page.getByRole('button', { name: /^Notifications/ }).last().click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel.getByRole('alert')).toContainText('Could not load notifications');
  await expect(panel.getByText("You're all caught up.")).toHaveCount(0);
  state.notificationFailure = false;
  await panel.getByRole('button', { name: 'Try again' }).click();
  state.readFailure = true;
  await panel.getByRole('button', { name: 'Mark all read' }).click();
  await expect(panel.getByRole('alert')).toContainText('Could not mark');
  await expect(page.getByRole('button', { name: 'Notifications, 1 unread' }).last()).toBeVisible();
  state.readFailure = false;
  await panel.getByRole('button', { name: 'Mark all read' }).click();
  await expect(panel.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
});

test('manager assigns a draft shift and publishes it with notification confirmation', async ({ page }) => {
  await authenticate(page);
  const state = await stubApi(page);
  const date = new Date(); date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  const iso = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  state.shifts = [{ id: shiftId, business_id: businessId, store_id: storeId, role_id: null, assigned_user_id: null, shift_date: iso, start_time: '09:00:00', end_time: '17:00:00', break_minutes: 30, status: 'unassigned', is_published: false, updated_at: '2026-10-04T00:00:00Z', notes: null }];
  await page.goto('/rota');
  await page.getByText('09:00–17:00', { exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('select').nth(2).selectOption(employeeId);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.shifts[0].assigned_user_id).toBe(employeeId);
  await page.getByRole('button', { name: /^Publish/ }).click();
  await page.getByRole('button', { name: 'Publish 1 shift', exact: true }).click();
  await expect(page.getByText('1 shifts published · 1 employees notified in the app')).toBeVisible();
  expect(state.shifts[0].is_published).toBe(true);
});

test('manager approves an employee leave request', async ({ page }) => {
  await authenticate(page);
  const state = await stubApi(page);
  state.leaves = [{ id: '66666666-6666-4666-8666-666666666666', business_id: businessId, user_id: employeeId, type: 'annual', source: 'employee_request', status: 'pending', start_date: '2026-10-12', end_date: '2026-10-13', created_at: '2026-10-04', sickness_meta: null, lifecycle_status: null, reason: 'Holiday' }];
  await page.goto('/leave');
  await page.getByRole('button', { name: 'Open actions' }).first().click();
  await page.getByRole('menuitem', { name: 'Approve', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.leaves[0].status).toBe('approved');
});

test('one click requests 28 November and approval preserves that date', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-04T12:00:00Z') });
  await authenticate(page);
  const state = await stubApi(page);
  state.role = 'employee';
  await page.goto('/leave');
  await page.getByRole('button', { name: 'Request time off', exact: true }).click();
  const request = page.getByRole('dialog').filter({ hasText: 'Request time off' });
  await request.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(request.getByText('Choose the dates for your leave.')).toBeVisible();
  expect(state.leaves).toHaveLength(0);
  await request.getByRole('button', { name: 'Pick a date range', exact: true }).click();
  await page.getByRole('button', { name: /next month/i }).click();
  await page.getByRole('button', { name: /Saturday, November 28th, 2026/i }).click();
  await request.getByText('Request time off', { exact: true }).click(); // Closing the picker must preserve the clicked day.
  await expect(request.getByRole('button', { name: 'Pick a date range' })).toContainText('28 Nov 2026');
  await request.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(request).toHaveCount(0);
  expect(state.leaves[0].start_date).toBe('2026-11-28');
  expect(state.leaves[0].end_date).toBe('2026-11-28');
  state.role = 'owner';
  await page.reload();
  await page.getByRole('button', { name: 'Open actions' }).first().click();
  await page.getByRole('menuitem', { name: 'Approve', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.leaves[0].status).toBe('approved');
  expect(state.leaves[0].start_date).toBe('2026-11-28');
  expect(state.leaves[0].end_date).toBe('2026-11-28');
});
