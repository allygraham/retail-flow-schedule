import { test, expect } from '@playwright/test';
import { authenticate, stubApi, employeeId } from './fixtures';

test('invite creation failures retry safely; links can be renewed and revoked', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page); state.inviteFailure = true;
  await page.goto('/team');
  await page.getByRole('button', { name: /Add employee/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').nth(0).fill('New');
  await dialog.locator('input').nth(1).fill('Colleague');
  await dialog.locator('input[type=email]').fill('colleague@example.test');
  await dialog.getByRole('button', { name: 'Create invite' }).click();
  await expect(dialog.getByText('Could not create the invitation')).toBeVisible();
  expect(state.invites).toHaveLength(0);
  state.inviteFailure = false;
  await dialog.getByRole('button', { name: 'Create invite' }).click();
  await expect(dialog.getByText(/test-created-invite/)).toBeVisible();
  expect(state.invites).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Done' }).click();
  state.inviteUpdateFailure = true;
  await page.getByRole('button', { name: 'Open actions for New Colleague' }).click();
  await page.getByRole('menuitem', { name: 'Revoke invite' }).click();
  await expect(page.getByText('Invite update failed')).toBeVisible();
  expect(state.invites[0].status).toBe('pending');
  state.inviteUpdateFailure = false;
  state.invites[0].expires_at = '2020-01-01';
  await page.reload();
  await page.getByRole('button', { name: 'Open actions for New Colleague' }).click();
  await page.getByRole('menuitem', { name: 'Renew invite' }).click();
  await expect(page.getByText('Invite refreshed')).toBeVisible();
  expect(new Date(String(state.invites[0].expires_at)).getTime()).toBeGreaterThan(Date.now());
  await page.getByRole('button', { name: 'Open actions for New Colleague' }).click();
  await page.getByRole('menuitem', { name: 'Revoke invite' }).click();
  await expect(page.getByText('Invite revoked')).toBeVisible();
  expect(state.invites[0].status).toBe('revoked');
});
test('role and employment edits use one transaction; failures retain the form', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page); state.editFailure = true;
  await page.goto('/team');
  await page.getByRole('button', { name: 'Open actions for Test Employee' }).click();
  await page.getByRole('menuitem', { name: 'Edit details' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('select').nth(0).selectOption('manager');
  await dialog.locator('input[type=number]').fill('30');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByText('Employment update failed')).toBeVisible();
  expect(state.employeeRole).toBe('employee'); expect(state.hours).toBe(20);
  state.editFailure = false;
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.employeeRole).toBe('manager'); expect(state.hours).toBe(30);
  const writes = state.writes.filter(write => write.endpoint === 'update_team_member');
  expect(writes.at(-1)?.body).toMatchObject({ _user_id: employeeId, _role: 'manager', _contracted_hours: 30 });
});
test('deactivation failures retry, disabled staff lose workspace access, reactivation restores it', async ({ page, browser }) => {
  await authenticate(page); const state = await stubApi(page); state.memberFailure = true;
  await page.goto('/team');
  await page.getByRole('button', { name: 'Open actions for Test Employee' }).click();
  await page.getByRole('menuitem', { name: 'Deactivate', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(page.getByText('Employee access update failed')).toBeVisible();
  expect(state.employeeActive).toBe(true);
  state.memberFailure = false;
  await dialog.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(dialog).toHaveCount(0); expect(state.employeeActive).toBe(false);
  const employeeContext = await browser.newContext();
  try {
    const employeePage = await employeeContext.newPage();
    await authenticate(employeePage, employeeId); await stubApi(employeePage, state);
    await employeePage.goto('http://127.0.0.1:4174/team');
    await expect(employeePage).toHaveURL(/\/signup$/);
    await expect(employeePage.getByRole('heading', { name: 'Your people' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open actions for Test Employee' }).click();
    await page.getByRole('menuitem', { name: 'Reactivate', exact: true }).click();
    await expect(page.getByText('Employee reactivated')).toBeVisible();
    await employeePage.goto('http://127.0.0.1:4174/rota');
    await expect(employeePage.getByRole('heading', { name: /Week of/ })).toBeVisible();
  } finally { await employeeContext.close(); }
});

for (const width of [1280, 390]) {
  test(`team displays and searches current member emails at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await authenticate(page); await stubApi(page);
    await page.goto('/team');
    await expect(page.getByText('employee@example.test', { exact: true })).toBeVisible();
    if (width === 1280) await page.getByRole('button', { name: 'Show filters' }).click();
    const search = page.getByPlaceholder(width === 1280 ? 'Search name, email, role…' : 'Search team…');
    await search.fill('employee@example.test');
    await expect(page.getByText('Test Employee', { exact: true })).toBeVisible();
    await search.fill('missing@example.test');
    await expect(page.getByText('employee@example.test', { exact: true })).not.toBeVisible();
    await search.fill('');
    await expect(page.getByText('employee@example.test', { exact: true })).toBeVisible();
  });
}

test('team email lookup errors show retry instead of blank addresses', async ({ page }) => {
  await authenticate(page); await stubApi(page);
  let fail = true;
  await page.route('**/rest/v1/rpc/get_team_member_emails*', route => fail ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Lookup unavailable' }) }) : route.fallback());
  await page.goto('/team');
  await expect(page.getByRole('alert')).toContainText('Could not load the team');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('employee@example.test', { exact: true })).toBeVisible();
});
