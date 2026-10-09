import { test, expect } from '@playwright/test';
import { authenticate, stubApi, ownerId, employeeId, shiftId, storeId } from './fixtures';
const request = { id: '88888888-8888-4888-8888-888888888888', requester_id: ownerId, requester_name: 'Test Owner', replacement_user_id: employeeId, replacement_name: 'Test Employee', reason: 'Available Thursday instead', manager_note: null, warnings: [], status: 'proposed', source: { id: shiftId, date: '2099-11-02', start: '09:00:00', end: '17:00:00', store: 'Main Store', role: null, break_minutes: 30, starts_at: '2099-11-02T09:00:00Z' }, swap: null, requester_accepted: false, replacement_accepted: false, created_at: '2026-10-09T10:00:00Z', updated_at: '2026-10-09T10:00:00Z' };
for (const width of [1280, 390]) {
 test(`employee acceptance and mobile layout at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 850 }); await authenticate(page); const state = await stubApi(page); state.role = 'employee';
  let accepted = false; let payload: Record<string, unknown> = {};
  await page.route('**/rest/v1/rpc/get_shift_change_requests', route => route.fulfill({ json: [{ ...request, requester_accepted: accepted }] }));
  await page.route('**/rest/v1/rpc/change_shift_request', route => { payload = route.request().postDataJSON(); accepted = true; return route.fulfill({ json: request.id }); });
  await page.goto('/shift-changes'); await expect(page.getByText('Waiting for employees')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm change' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('shift-changes.png'), fullPage: true });
  await page.getByRole('button', { name: 'Accept proposal' }).click();
  await expect(page.getByRole('button', { name: 'Accept proposal' })).toHaveCount(0);
  expect(payload._expected_updated_at).toBe(request.updated_at); expect(payload._action).toBe('accept');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 });
}
test('employee creates a request without seeing colleague shift choices', async ({ page }) => {
 await authenticate(page); const state = await stubApi(page); state.role = 'employee';
 state.shifts = [{ id: shiftId, business_id: '33333333-3333-4333-8333-333333333333', assigned_user_id: ownerId, store_id: storeId, shift_date: '2099-11-02', start_time: '09:00:00', end_time: '17:00:00', is_published: true, status: 'scheduled' }];
 await page.route('**/rest/v1/rpc/get_shift_change_requests', route => route.fulfill({ json: [] }));
 let payload: Record<string, unknown> = {}; await page.route('**/rest/v1/rpc/change_shift_request', route => { payload = route.request().postDataJSON(); return route.fulfill({ json: request.id }); });
 await page.goto(`/shift-changes?shift=${shiftId}`); const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
 await expect(dialog.getByLabel('Colleague')).toHaveCount(0); await dialog.getByLabel('What change do you need?').fill('Can work Thursday instead');
 await dialog.getByRole('button', { name: 'Send request' }).click(); await expect(dialog).toHaveCount(0);
 expect(payload._shift_id).toBe(shiftId); expect(payload._reason).toBe('Can work Thursday instead');
});
test('manager proposes cover and confirms only ready requests', async ({ page }) => {
 await authenticate(page); await stubApi(page); let status = 'requested'; const actions: string[] = [];
 await page.route('**/rest/v1/rpc/get_shift_change_requests', route => route.fulfill({ json: [{ ...request, status, replacement_user_id: status === 'requested' ? null : employeeId, requester_accepted: status === 'ready', replacement_accepted: status === 'ready' }] }));
 await page.route('**/rest/v1/rpc/change_shift_request', route => { const action = route.request().postDataJSON()._action; actions.push(action); status = action === 'propose' ? 'ready' : 'completed'; return route.fulfill({ json: request.id }); });
 await page.goto('/shift-changes'); await expect(page.getByRole('button', { name: 'Confirm change' })).toHaveCount(0);
 await page.getByRole('button', { name: 'Propose cover or swap' }).click(); await page.getByLabel('Colleague').selectOption(employeeId);
 await page.getByRole('button', { name: 'Send proposal' }).click(); await expect(page.getByText('Both employees have accepted. Review the arrangement and confirm the change.')).toBeVisible();
 await page.getByRole('button', { name: 'Confirm change' }).click(); await expect(page.getByText('No active shift changes')).toBeVisible(); await page.getByRole('button', { name: /History/ }).click(); await expect(page.getByText('Confirmed', { exact: true })).toBeVisible(); expect(actions).toEqual(['propose', 'confirm']);
});
test('server conflict is visible and does not show a confirmed change', async ({ page }) => {
 await authenticate(page); const state = await stubApi(page); state.role = 'employee';
 await page.route('**/rest/v1/rpc/get_shift_change_requests', route => route.fulfill({ json: [request] }));
 await page.route('**/rest/v1/rpc/change_shift_request', route => route.fulfill({ status: 400, json: { message: 'The request changed. Refresh and review the current proposal.' } }));
 await page.goto('/shift-changes'); await page.getByRole('button', { name: 'Accept proposal' }).click(); await expect(page.getByRole('alert')).toContainText('The request changed');
 await expect(page.getByRole('button', { name: 'Accept proposal' })).toBeEnabled();
});

for (const width of [1280, 390, 320]) test(`manager handover and history remain readable at ${width}px`, async ({ page }, info) => {
 await page.setViewportSize({ width, height: 900 }); await authenticate(page); await stubApi(page);
 await page.route('**/rest/v1/business_branding**', route => route.fulfill({ json: [{ theme_key: 'topdrawer', primary_color: '#747C61', secondary_color: '#4C4E56', accent_color: '#747C61', surface_color: '#FFFFFF' }] }));
 await page.route('**/rest/v1/rpc/get_shift_change_requests', route => route.fulfill({ json: [{ ...request, requester_id: '99999999-9999-4999-8999-999999999999' }, { ...request, id: 'closed', status: 'completed' }] }));
 await page.goto('/shift-changes'); await expect(page.getByText('Waiting for employees')).toBeVisible();
 await expect(page.getByRole('button', { name: 'Confirm change' })).toHaveCount(0);
 await expect(page.getByText('Available Thursday instead')).toBeHidden();
 await page.getByText('Request details', { exact: true }).click(); await expect(page.getByText('Available Thursday instead')).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.getByText('Request details', { exact: true }).click(); await page.getByRole('heading', { name: 'Shift changes', exact: true }).click();
 await page.screenshot({ path: info.outputPath('manager-handover.png'), fullPage: true });
 await page.getByRole('button', { name: /History/ }).click(); await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
 await page.goBack(); await expect(page.getByText('Waiting for employees')).toBeVisible();
});
