import { test, expect, type Page } from '@playwright/test';
import { authenticate, stubApi } from './fixtures';
async function showToast(page: Page, type: string, title: string, description: string, action = false) {
  await page.evaluate(async ({ type, title, description, action }) => {
    const url = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/sonner\.js/.test(name));
    if (!url) throw new Error('The signed-in Sonner module was not loaded');
    const { toast } = await import(url);
    toast[type](title, { description, duration: Infinity, ...(action ? { action: { label: 'Confirm', onClick: () => { document.body.dataset.toastAction = 'confirmed'; } }, cancel: { label: 'Cancel', onClick: () => {} } } : {}) });
  }, { type, title, description, action });
}
for (const width of [320, 390, 1440]) {
  test(`toast status, long text and actions are visible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await authenticate(page); await stubApi(page); await page.goto('/team');
    await expect(page.getByText('employee@example.test')).toBeVisible();
    for (const [type, color] of [['success', 'rgb(34, 197, 94)'], ['error', 'rgb(239, 68, 68)'], ['info', 'rgb(91, 95, 239)'], ['warning', 'rgb(245, 158, 11)']]) {
      await showToast(page, type, 'Changes saved', 'Your changes are available to the team.');
      const notification = page.locator('[data-sonner-toast]').filter({ hasText: 'Changes saved' });
      await expect(notification).toHaveCSS('background-color', 'rgb(15, 23, 42)');
      await expect(notification).toHaveCSS('border-left-color', color);
      await expect(notification).toBeInViewport();
      await expect.poll(async () => (await notification.boundingBox())?.y ?? 0).toBeGreaterThanOrEqual(width < 600 ? 60 : 20);
      const bounds = (await notification.boundingBox())!;
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      const close = notification.getByRole('button', { name: 'Close toast' });
      expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(44);
      await close.click(); await expect(notification).toHaveCount(0);
    }
    await showToast(page, 'info', 'Confirm this operation?', 'A long notification message must remain readable without clipping, including a very-long-example-reference-that-must-wrap-rather-than-overflow@example.test', true);
    const notification = page.locator('[data-sonner-toast]');
    await expect(notification.getByRole('button', { name: 'Confirm', exact: true })).toBeInViewport();
    expect(await notification.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(Math.round((await notification.getByRole('button', { name: 'Confirm', exact: true }).boundingBox())!.height)).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: test.info().outputPath('toast-actions.png') });
    await notification.getByRole('button', { name: 'Confirm', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-toast-action', 'confirmed');
    await expect(notification).toHaveCount(0);
  });
}
test('existing invitation-copy confirmation uses the styled toast', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page);
  state.invites = [{ id: 'invite-test', full_name: 'New Person', email: 'new@example.test', role: 'employee', status: 'pending', expires_at: '2099-01-01', token: 'invite-token' }];
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/team');
  await page.getByRole('button', { name: 'Open actions for New Person' }).click();
  await page.getByRole('menuitem', { name: 'Copy link', exact: true }).click();
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Invite link copied' })).toHaveCSS('background-color', 'rgb(15, 23, 42)');
});

for (const [theme, background, primary] of [['forest', 'rgb(5, 46, 22)', 'rgb(22, 163, 74)'], ['sunset', 'rgb(67, 20, 7)', 'rgb(249, 115, 22)'], ['topdrawer', 'rgb(76, 78, 86)', 'rgb(116, 124, 97)']]) {
  test(`toast follows the ${theme} workspace palette`, async ({ page }) => {
    await authenticate(page); await stubApi(page);
    await page.route('**/rest/v1/business_branding*', route => route.fulfill({ json: { theme_key: theme, secondary_color: '#' + background.match(/\d+/g)!.map(value => Number(value).toString(16).padStart(2, '0')).join(''), primary_color: '#' + primary.match(/\d+/g)!.map(value => Number(value).toString(16).padStart(2, '0')).join('') } }));
    await page.goto('/team'); await expect(page.getByText('employee@example.test')).toBeVisible();
    await showToast(page, 'info', 'Theme confirmation', 'Palette matches this workspace.', true);
    const notification = page.locator('[data-sonner-toast]');
    await expect(notification).toHaveCSS('background-color', background);
    await expect(notification).toHaveCSS('border-left-color', primary);
    await expect(notification.getByRole('button', { name: 'Confirm', exact: true })).toHaveCSS('background-color', primary);
  });
}
test('custom light toast and action colours keep readable foregrounds', async ({ page }) => {
  await authenticate(page); await stubApi(page);
  await page.route('**/rest/v1/business_branding*', route => route.fulfill({ json: { theme_key: 'default', primary_color: '#FDE047', secondary_color: '#F5EBDC' } }));
  await page.goto('/team'); await expect(page.getByText('employee@example.test')).toBeVisible();
  await showToast(page, 'info', 'Custom theme', 'Readable on a light custom background.', true);
  const notification = page.locator('[data-sonner-toast]');
  await expect(notification).toHaveCSS('background-color', 'rgb(245, 235, 220)');
  await expect(notification).toHaveCSS('color', 'rgb(0, 0, 0)');
  const action = notification.getByRole('button', { name: 'Confirm', exact: true });
  await expect(action).toHaveCSS('background-color', 'rgb(253, 224, 71)');
  await expect(action).toHaveCSS('color', 'rgb(0, 0, 0)');
});
