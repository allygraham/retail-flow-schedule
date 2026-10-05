import { test, expect } from '@playwright/test';
import { authenticate, stubApi, businessId, employeeId, ownerId, storeId, shiftId } from './fixtures';

test('stale coverage release preserves every shift and refreshes before retry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page); const state = await stubApi(page);
  state.leaves = [{ id: '66666666-6666-4666-8666-666666666666', business_id: businessId, user_id: employeeId, type: 'annual', source: 'employee_request', status: 'pending', start_date: '2026-10-12', end_date: '2026-10-13', created_at: '2026-10-04', sickness_meta: null, lifecycle_status: null, reason: 'Holiday' }];
  const shift = { id: shiftId, business_id: businessId, store_id: storeId, role_id: null, assigned_user_id: employeeId, shift_date: '2026-10-12', start_time: '09:00:00', end_time: '17:00:00', break_minutes: 30, status: 'scheduled', is_published: false, updated_at: '2026-10-05T12:00:00Z' };
  state.shifts = [shift, { ...shift, id: 'second', shift_date: '2026-10-13' }];
  await page.goto('/leave');
  await page.getByRole('button', { name: /^Open details for/ }).first().click();
  const dialog = page.getByRole('dialog');
  const release = dialog.getByRole('button', { name: 'Open for pickup' });
  await expect(dialog.getByText('2 shifts need cover · 15.0h')).toBeVisible();
  state.shifts[1] = { ...state.shifts[1], assigned_user_id: ownerId, updated_at: '2026-10-05T13:00:00Z' };
  await release.click();
  await expect(dialog.getByRole('alert')).toContainText('Coverage has changed');
  expect(state.shifts.map(shift => shift.assigned_user_id)).toEqual([employeeId, ownerId]);
  await expect(page.getByText('Shifts opened for pickup')).toHaveCount(0);
  const writes = () => state.writes.filter(write => write.endpoint === 'release_coverage_shifts');
  expect(writes()).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(dialog.getByText('1 shift need cover · 7.5h')).toBeVisible();
  expect(writes()).toHaveLength(1);
  await release.click();
  await expect(page.getByText('Shifts opened for pickup')).toBeVisible();
  expect(state.shifts.map(shift => shift.assigned_user_id)).toEqual([null, ownerId]);
  expect(writes()[1].body).toMatchObject({ _business_id: businessId, _shifts: [{ id: shiftId, updated_at: '2026-10-05T12:00:00Z' }] });
});
