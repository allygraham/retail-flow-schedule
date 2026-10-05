import { test, expect, devices } from '@playwright/test';
import { authenticate, stubApi } from './fixtures';

test.use({ ...devices['Pixel 7'], defaultBrowserType: 'chromium' });
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page); await stubApi(page);
  await page.goto('/team');
  await expect(page.getByRole('heading', { name: 'Your people' })).toBeVisible();
});

test('form dialog is named, traps focus and restores the opener on Escape', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Add employee', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Add employee', exact: true });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  expect(await page.locator('main').evaluate(el => !!el.closest('[aria-hidden="true"]'))).toBe(true);
  await dialog.getByRole('button', { name: 'Create invite' }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Create invite' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await page.locator('main').evaluate(el => !!el.closest('[aria-hidden="true"]'))).toBe(false);
});

test('close button and backdrop restore focus and release scroll locking', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Add employee', exact: true });
  await opener.click();
  await page.getByRole('dialog', { name: 'Add employee' }).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(opener).toBeFocused();
  await opener.click();
  await page.mouse.click(4, 4);
  await expect(page.getByRole('dialog', { name: 'Add employee' })).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator('body')).not.toHaveAttribute('data-scroll-locked', '1');
});

test('date-picker portal remains interactive and Escape closes only the calendar', async ({ page }) => {
  await page.getByRole('button', { name: 'Add employee', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add employee', exact: true });
  const trigger = dialog.getByRole('button', { name: 'Pick start date', exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const calendar = page.getByRole('dialog', { name: 'Choose date', exact: true });
  await expect(calendar).toBeVisible();
  expect(await calendar.evaluate(el => el.parentElement === document.body)).toBe(true);
  expect(await calendar.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await calendar.getByRole('button', { name: /next month/i }).click();
  await page.keyboard.press('Escape');
  await expect(calendar).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  const notes = dialog.locator('textarea');
  await notes.click();
  await expect(calendar).toHaveCount(0);
  await expect(notes).toBeFocused();
  await trigger.click();
  await calendar.getByRole('button', { name: /next month/i }).click();
  await calendar.locator('[data-day] button:not([disabled])').first().click();
  await expect(calendar).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();
});

test('short mobile dialogs scroll their fields while keeping the footer accessible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 480 });
  await page.getByRole('button', { name: 'Add employee', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add employee', exact: true });
  const bounds = await dialog.boundingBox();
  expect(bounds!.height).toBeLessThanOrEqual(480);
  await expect(dialog.getByRole('button', { name: 'Create invite' })).toBeInViewport();
  const fields = dialog.locator('textarea');
  await fields.scrollIntoViewIfNeeded();
  await expect(fields).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  expect(await dialog.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.screenshot({ path: test.info().outputPath('short-dialog.png') });
});

test('dialogs opened from row menus restore focus to the row action button', async ({ page }) => {
  const actions = page.getByRole('button', { name: 'Open actions for Test Employee', exact: true });
  await actions.click();
  await page.getByRole('menuitem', { name: 'Edit details', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Test Employee', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(actions).toBeFocused();
});
