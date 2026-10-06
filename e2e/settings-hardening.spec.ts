import { test, expect } from '@playwright/test';
import { authenticate, stubApi, session } from './fixtures';

test.beforeEach(async ({ page }) => { await authenticate(page); await stubApi(page); });
test('same-user auth refresh preserves an open employee draft while rechecking tenancy', async ({ page }) => {
  let lookups = 0;
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/memberships') && url.searchParams.get('select')?.includes('businesses')) lookups++;
  });
  await page.goto('/team');
  await page.getByRole('button', { name: 'Open actions for Test Employee' }).click();
  await page.getByRole('menuitem', { name: 'Edit details' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Test Employee' });
  const hours = dialog.getByRole('spinbutton', { name: 'Contracted hours / week' });
  await hours.fill('31');
  const previous = lookups;
  await page.evaluate(value => {
    const channel = new BroadcastChannel('sb-example-auth-token');
    channel.postMessage({ event: 'TOKEN_REFRESHED', session: value });
    channel.close();
  }, session);
  await expect.poll(() => lookups).toBeGreaterThan(previous);
  await expect(dialog).toBeVisible(); await expect(hours).toHaveValue('31');
});
test('shared labels focus their inputs and describe optional fields in an employee dialog', async ({ page }) => {
  await page.goto('/team'); await page.getByRole('button', { name: 'Add employee', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add employee', exact: true });
  await dialog.locator('label').filter({ hasText: 'First name' }).click();
  await expect(dialog.getByRole('textbox', { name: 'First name' })).toBeFocused();
  await expect(dialog.getByRole('spinbutton', { name: 'Contracted hours / week' })).toHaveAccessibleDescription('Optional');
  await expect(dialog.getByRole('textbox', { name: 'Notes' })).toHaveAccessibleDescription('Visible to managers only');
});
test('a stale unused-role list cannot hide a deletion conflict from the database', async ({ page }) => {
  await page.route('https://example.supabase.co/rest/v1/roles_catalog**', async route => {
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: '23503', message: 'Role is referenced' }) });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 'role', name: 'Cashier', color: '#6366f1' }]) });
  });
  await page.goto('/settings');
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Job roles' }).click();
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete role Cashier' }).click();
  await expect(page.getByText('This role is still used by an employee, invitation or shift. Remove those assignments before deleting it.')).toBeVisible();
  await expect(page.getByText('Cashier', { exact: true })).toBeVisible();
  await expect(page.getByText('Role deleted', { exact: true })).toHaveCount(0);
});
