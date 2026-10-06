import { test, expect, type Page } from '@playwright/test';
import { authenticate, stubApi, businessId, employeeId, shiftId, storeId } from './fixtures';

const monday = '2026-10-05';
const version = '2026-10-04T00:00:00Z';
const shift = (overrides: Record<string, unknown> = {}) => ({ id: shiftId, business_id: businessId, store_id: storeId, role_id: null, assigned_user_id: employeeId, shift_date: monday, start_time: '09:00:00', end_time: '17:00:00', break_minutes: 30, notes: 'Opening', status: 'scheduled', is_published: false, updated_at: version, ...overrides });
const cell = (page: Page, person: string, date: string) => page.locator(`[data-rota-cell="${person}|${date}"]`);
async function open(page: Page) {
  await page.clock.setFixedTime( new Date('2026-10-05T12:00:00Z'));
  await authenticate(page);
  const state = await stubApi(page);
  return state;
}
async function drag(page: Page, id: string, person: string, date: string) {
  const source = page.locator(`[data-shift-id="${id}"]`);
  await expect(source).toBeVisible();
  const from = await source.boundingBox(); const to = await cell(page, person, date).boundingBox();
  if (!from || !to) throw new Error('Rota cells must be visible');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
}

test('dragging changes date and assignment through one versioned request', async ({ page }) => {
  const state = await open(page); state.shifts = [shift()];
  await page.goto('/rota');
  await drag(page, shiftId, 'unassigned', '2026-10-06');
  await expect(cell(page, 'unassigned', '2026-10-06').getByText('09:00–17:00')).toBeVisible();
  const moves = state.writes.filter(write => write.endpoint === 'move_rota_shift');
  expect(moves).toHaveLength(1);
  expect(moves[0].body).toMatchObject({ _business_id: businessId, _shift_id: shiftId, _assigned_user_id: null, _shift_date: '2026-10-06', _expected_updated_at: version });
});

test('occupied-cell drop swaps both shifts with both versions in one call', async ({ page }) => {
  const state = await open(page);
  state.shifts = [shift(), shift({ id: 'second-shift', shift_date: '2026-10-06', start_time: '10:00:00', updated_at: '2026-10-04T01:00:00Z' })];
  await page.goto('/rota'); await drag(page, shiftId, employeeId, '2026-10-06');
  await expect(cell(page, employeeId, monday).getByText('10:00–17:00')).toBeVisible();
  await expect(cell(page, employeeId, '2026-10-06').getByText('09:00–17:00')).toBeVisible();
  const moves = state.writes.filter(write => write.endpoint === 'move_rota_shift');
  expect(moves).toHaveLength(1);
  expect(moves[0].body).toMatchObject({ _swap_shift_id: 'second-shift', _swap_expected_updated_at: '2026-10-04T01:00:00Z', _expected_updated_at: version });
});

for (const conflict of ['Employee is unavailable', 'Employee has approved leave', 'Scheduling is blocked on company holiday']) {
  test(`rejected drag preserves original shift: ${conflict}`, async ({ page }) => {
    const state = await open(page); state.shifts = [shift()]; state.shiftFailure = conflict;
    await page.goto('/rota'); await drag(page, shiftId, employeeId, '2026-10-06');
    await expect(page.getByText(conflict, { exact: true })).toBeVisible();
    await expect(cell(page, employeeId, monday).getByText('09:00–17:00')).toBeVisible();
    expect(state.shifts[0].shift_date).toBe(monday);
  });
}

test('concurrent manager edit is not overwritten by stale modal', async ({ page }) => {
  const state = await open(page); state.shifts = [shift()];
  await page.goto('/rota'); await page.getByText('09:00–17:00', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  state.shifts[0] = { ...state.shifts[0], notes: 'Other manager saved this', updated_at: '2026-10-05T13:00:00Z' };
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByText('Shift has changed. Close this form and refresh the rota before editing again.')).toBeVisible();
  expect(state.shifts[0].notes).toBe('Other manager saved this');
  expect(state.writes.find(write => write.endpoint === 'shifts')?.body.updated_at).toBeUndefined();
});

test('copy previous week preserves assignment and hours but creates drafts', async ({ page }) => {
  const state = await open(page); state.shifts = [shift({ shift_date: '2026-09-28', is_published: true })];
  await page.goto('/rota'); await page.getByRole('button', { name: 'Copy previous week' }).click();
  await expect(cell(page, employeeId, monday).getByText('09:00–17:00')).toBeVisible();
  expect(state.batches).toHaveLength(1);
  expect(state.batches[0]).toEqual([expect.objectContaining({ shift_date: monday, assigned_user_id: employeeId, start_time: '09:00:00', end_time: '17:00:00', break_minutes: 30, notes: 'Opening', is_published: false })]);
});

test('failed copy reports error and can be retried without duplicate shifts', async ({ page }) => {
  const state = await open(page); state.shifts = [shift({ shift_date: '2026-09-28' })]; state.shiftFailure = 'Employee is unavailable';
  await page.goto('/rota'); await page.getByRole('button', { name: 'Copy previous week' }).click();
  await expect(page.getByText('Employee is unavailable', { exact: true })).toBeVisible();
  expect(state.shifts).toHaveLength(1); expect(state.batches).toHaveLength(0);
  state.shiftFailure = null;
  await page.getByRole('button', { name: 'Copy previous week' }).click();
  await expect(cell(page, employeeId, monday).getByText('09:00–17:00')).toBeVisible();
  expect(state.shifts).toHaveLength(2); expect(state.batches).toHaveLength(1);
});

test('failed swap keeps both original placements', async ({ page }) => {
  const state = await open(page);
  state.shifts = [shift(), shift({ id: 'second-shift', shift_date: '2026-10-06', start_time: '10:00:00' })];
  state.shiftFailure = 'Swap conflicts with approved leave';
  await page.goto('/rota'); await drag(page, shiftId, employeeId, '2026-10-06');
  await expect(page.getByText(state.shiftFailure, { exact: true })).toBeVisible();
  await expect(cell(page, employeeId, monday).getByText('09:00–17:00')).toBeVisible();
  await expect(cell(page, employeeId, '2026-10-06').getByText('10:00–17:00')).toBeVisible();
});

test('approved leave disables cell creation and drop assignment', async ({ page }) => {
  const state = await open(page); state.shifts = [shift()];
  state.leaves = [{ user_id: employeeId, start_date: '2026-10-06', end_date: '2026-10-06', status: 'approved', leave_type: 'annual' }];
  await page.goto('/rota');
  await expect(cell(page, employeeId, '2026-10-06').getByText('Leave', { exact: true })).toBeVisible();
  await cell(page, employeeId, '2026-10-06').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await drag(page, shiftId, employeeId, '2026-10-06');
  await expect(cell(page, employeeId, monday).getByText('09:00–17:00')).toBeVisible();
  expect(state.writes.filter(write => write.endpoint === 'move_rota_shift')).toHaveLength(0);
});

test('company closure prevents assigned shift save before any write', async ({ page }) => {
  const state = await open(page); state.shifts = [shift()];
  state.holidays = [{ id: 'closure', business_id: businessId, date: monday, name: 'Shop closed', blocks_scheduling: true }];
  await page.goto('/rota'); await page.getByText('09:00–17:00', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByText(/Scheduling is blocked on Shop closed/)).toBeVisible();
  expect(state.writes.filter(write => write.endpoint === 'shifts')).toHaveLength(0);
});


test('weekly employee hours include drafts, deduct breaks, exclude cancellations and update after edits', async ({ page }) => {
  const state = await open(page);
  state.shifts = [shift(), shift({ id: 'short-shift', shift_date: '2026-10-06', start_time: '09:00:00', end_time: '09:10:00', break_minutes: null, is_published: true }), shift({ id: 'another-short-shift', shift_date: '2026-10-07', start_time: '09:00:00', end_time: '09:10:00', break_minutes: 0 }), shift({ id: 'cancelled-shift', status: 'cancelled' }), shift({ id: 'open-shift', assigned_user_id: null })];
  await page.goto('/rota');
  const total = page.getByLabel('Test Employee weekly hours');
  await expect(total).toHaveText('7.83h');
  await page.locator(`[data-shift-id="${shiftId}"]`).getByText('09:00–17:00').click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('select').nth(2).selectOption('');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(total).toHaveText('0.33h');
});

test('employees without shifts show zero weekly hours', async ({ page }) => {
  await open(page); await page.goto('/rota');
  await expect(page.getByLabel('Test Employee weekly hours')).toHaveText('0h');
});


test('rota loads without validation and saving waits for it before checking shift times', async ({ page }) => {
  const state = await open(page); state.shifts = [shift()];
  let requests = 0;
  let release!: () => void;
  let requested!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  const requestStarted = new Promise<void>(resolve => { requested = resolve; });
  await page.route('**/src/lib/validation.ts*', async route => {
    requests++; requested(); await ready; await route.continue();
  });
  await page.goto('/rota');
  await page.getByText('09:00–17:00', { exact: true }).click();
  expect(requests).toBe(0);
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type=time]').nth(1).fill('08:00');
  const save = dialog.getByRole('button', { name: 'Save', exact: true });
  await save.click();
  try {
    await requestStarted;
    await expect(save).toBeDisabled();
    expect(state.writes.filter(write => write.endpoint === 'shifts')).toHaveLength(0);
    await expect(dialog).toBeVisible();
  } finally { release(); }
  await expect(dialog.getByText('Shift end time must be after start time')).toBeVisible();
  await expect(save).toBeEnabled();
  expect(state.writes.filter(write => write.endpoint === 'shifts')).toHaveLength(0);
  await dialog.locator('input[type=time]').nth(1).fill('17:00');
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes.filter(write => write.endpoint === 'shifts')).toHaveLength(1);
  expect(requests).toBe(1);
});

test('failed validation download keeps the shift editor open and performs no writes', async ({ page }) => {
  const state = await open(page); state.shifts = [shift()];
  await page.route('**/src/lib/validation.ts*', route => route.abort());
  await page.goto('/rota');
  await page.getByText('09:00–17:00', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  const save = dialog.getByRole('button', { name: 'Save', exact: true });
  await save.click();
  await expect(dialog.getByText('Could not load shift validation. Please try again.')).toBeVisible();
  await expect(save).toBeEnabled();
  expect(state.writes.filter(write => write.endpoint === 'shifts')).toHaveLength(0);
  await expect(dialog.locator('input[type=time]').nth(1)).toHaveValue('17:00:00');
});

test('week loading preserves the store, staff rows and seven-day grid', async ({ page }) => {
  const state = await open(page); state.shifts = [shift()];
  let storeReads = 0;
  page.on('request', request => { if (request.url().includes('/rest/v1/store_locations')) storeReads++; });
  await page.goto('/rota');
  const grid = page.getByLabel('Weekly rota', { exact: true });
  await expect(grid).toHaveAttribute('aria-busy', 'false');
  const store = page.getByRole('button', { name: 'Main Store', exact: true });
  await expect(store).toBeVisible();
  const originalGrid = await grid.boundingBox();
  const originalStore = await store.boundingBox();
  const reads = storeReads;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rest/v1/shifts*', async route => { await pending; await route.fallback(); });
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  try {
    await expect(grid).toHaveAttribute('aria-busy', 'true');
    await expect(store).toBeVisible();
    await expect(grid.getByText('Test Employee', { exact: true })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading rota' })).toHaveCount(0);
    await expect(grid.locator('[data-rota-cell]')).toHaveCount(14);
    await expect(page.getByRole('button', { name: /Publish/ })).toBeDisabled();
    await expect(cell(page, employeeId, '2026-10-12').getByText('09:00–17:00')).toHaveCount(0);
    await cell(page, employeeId, '2026-10-12').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const duringGrid = await grid.boundingBox();
    const duringStore = await store.boundingBox();
    expect(duringGrid?.height).toBeCloseTo(originalGrid!.height, 0);
    expect(duringStore?.x).toBeCloseTo(originalStore!.x, 0);
    expect(storeReads).toBe(reads);
    await page.getByRole('button', { name: 'Next week', exact: true }).click();
    await expect(cell(page, employeeId, '2026-10-19')).toBeVisible();
  } finally { release(); }
  await expect(grid).toHaveAttribute('aria-busy', 'false');
  await expect(store).toBeVisible();
  await expect(cell(page, employeeId, '2026-10-12')).toHaveCount(0);
});
