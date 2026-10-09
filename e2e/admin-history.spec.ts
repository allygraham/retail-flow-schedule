import { test, expect } from '@playwright/test';
import { authenticate, stubApi, employeeId, businessId } from './fixtures';

test('owner changes access, errors preserve the choice, Admins have no leave allocation', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page); state.editFailure = true;
  await page.goto('/team');
  await page.getByRole('button', { name: 'Open actions for Test Employee' }).click();
  await page.getByRole('menuitem', { name: 'Change access' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Access role').selectOption('admin');
  await dialog.getByRole('button', { name: 'Save access' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Access update failed');
  await expect(dialog.getByLabel('Access role')).toHaveValue('admin');
  state.editFailure = false;
  await dialog.getByRole('button', { name: 'Save access' }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.employeeRole).toBe('admin');
  expect(state.writes.filter(write => write.endpoint === 'set_business_role').at(-1)?.body).toEqual({ _business_id: businessId, _user_id: employeeId, _role: 'admin' });
  await expect(page.getByRole('button', { name: 'Edit leave entitlement for Test Employee' })).toHaveCount(0);
});

for (const width of [1280, 390]) {
  test(`history shows changes and recovers from errors at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await authenticate(page); await stubApi(page);
    let fail = true;
    await page.route('**/rest/v1/change_events**', route => route.fulfill({ status: fail ? 500 : 200, contentType: 'application/json', body: JSON.stringify(fail ? { message: 'History unavailable' } : [{ id: 'event', business_id: businessId, actor_name: 'Test Owner', entity_type: 'store_locations', entity_id: 'store', action: 'updated', occurred_at: '2026-10-09T09:00:00Z', subject: 'Main Store', before_values: { name: 'Old store' }, after_values: { name: 'Main Store' } }]) }));
    await page.goto('/history');
    await expect(page.getByRole('alert')).toBeVisible();
    fail = false; await page.getByRole('button', { name: /Try again|Retry/ }).click();
    await expect(page.getByText('Store updated', { exact: true })).toBeVisible();
    await page.getByText('View changes', { exact: true }).click();
    await expect(page.getByText('Old store → Main Store')).toBeVisible();
    const response = page.waitForRequest(request => request.url().includes('change_events') && request.url().includes('entity_type=eq.store_locations'));
    await page.getByLabel('Area').selectOption('store_locations'); await response;
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('Admin can access history and settings without granting privileged roles', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page); state.role = 'admin';
  await page.route('**/rest/v1/change_events**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'Change history' })).toBeVisible();
  await page.goto('/team');
  await page.getByRole('button', { name: 'Open actions for Test Employee' }).click();
  await expect(page.getByRole('menuitem', { name: 'Change access' })).toHaveCount(0);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Add employee' }).click();
  await expect(page.getByRole('dialog').getByLabel('Role').locator('option[value=admin]')).toHaveCount(0);
  await page.goto('/profile');
  await expect(page.getByRole('button', { name: 'Request time off' })).toHaveCount(0);
});

test('manager cannot open history even through a direct URL', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page); state.role = 'manager';
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'Change history' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Change history' })).toHaveCount(0);
});
