import { test, expect } from '@playwright/test';
import { authenticate, stubApi, employeeId } from './fixtures';
for (const width of [320, 390, 1440]) {
  test(`grouped sidebar follows the workspace palette at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await authenticate(page); await stubApi(page);
    await page.route('**/rest/v1/business_branding*', route => route.fulfill({ json: { theme_key: 'topdrawer', primary_color: '#747C61', secondary_color: '#4C4E56', display_name: 'The Top Drawer', logo_url: '/test-workspace-logo.svg' } }));
    await page.route('**/test-workspace-logo.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="88" viewBox="0 0 280 88"><text x="0" y="48" fill="#747C61" font-size="28">THE TOP DRAWER</text></svg>' }));
    await page.goto('/team'); await expect(page.getByRole('heading', { name: 'Your people' })).toBeVisible();
    if (width < 768) await page.getByRole('button', { name: 'Open menu' }).click();
    const sidebar = width < 768 ? page.getByRole('dialog', { name: 'Main navigation' }) : page.getByRole('complementary');
    await expect(sidebar).toHaveCSS('background-color', 'rgb(76, 78, 86)');
    await expect(sidebar.getByRole('link', { name: 'The Top Drawer', exact: true })).toHaveCount(1);
    const identity = sidebar.getByRole('link', { name: 'The Top Drawer', exact: true });
    const logo = await identity.locator('img').boundingBox();
    expect(logo!.width).toBeGreaterThanOrEqual(120);
    await expect(identity).toHaveText('');
    await expect(sidebar.getByText('owner', { exact: true })).toHaveCount(1);
    const nav = sidebar.getByRole('navigation', { name: 'Primary navigation' });
    for (const label of ['Work', 'Manage', 'Account']) await expect(nav.getByRole('group', { name: label })).toBeVisible();
    const active = nav.getByRole('link', { name: 'Team', exact: true });
    await expect(active).toHaveAttribute('aria-current', 'page');
    await expect(active).toHaveCSS('background-color', 'rgb(116, 124, 97)');
    await expect(active).toHaveCSS('color', 'rgb(255, 255, 255)');
    const signout = sidebar.getByRole('button', { name: 'Sign out', exact: true });
    await expect(signout).toBeVisible();
    await expect(signout).not.toContainText('Test Owner');
    await expect(sidebar.getByText('Test Owner', { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('sidebar.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
test('employee navigation preserves permissions and hides empty management groups', async ({ page }) => {
  await authenticate(page, employeeId); const state = await stubApi(page); state.role = 'employee';
  await page.goto('/dashboard'); await expect(page.getByRole('heading', { name: /Good/ })).toBeVisible();
  const identity = page.getByRole('complementary').getByRole('link', { name: 'Test Shop', exact: true });
  await expect(identity.getByText('Test Shop', { exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(nav.getByRole('group', { name: 'Work' })).toBeVisible();
  await expect(nav.getByRole('group', { name: 'Account' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Team', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('group', { name: 'Manage' })).toHaveCount(0);
});
