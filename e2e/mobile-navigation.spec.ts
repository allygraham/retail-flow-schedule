import { test, expect, devices } from '@playwright/test';
import { authenticate, stubApi } from './fixtures';

test.use({ ...devices['Pixel 7'], defaultBrowserType: 'chromium' });
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page); await stubApi(page);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Good/ })).toBeVisible();
});

test('closed navigation is absent; open menu contains keyboard focus and hides the page', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Open menu' });
  await expect(page.getByRole('dialog', { name: 'Main navigation' })).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Main navigation' });
  await expect(drawer).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused();
  await expect(drawer.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await page.locator('main').evaluate(el => !!el.closest('[aria-hidden="true"]'))).toBe(true);
  // Each end of the tab sequence wraps inside the dialog.
  await drawer.getByRole('button', { name: 'Sign out' }).focus();
  await page.keyboard.press('Tab');
  expect(await drawer.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await drawer.locator('a').first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(drawer.getByRole('button', { name: 'Sign out' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('close button and backdrop restore focus and unlock scrolling', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Open menu' });
  const previousOverflow = await page.evaluate(() => document.body.style.overflow);
  await trigger.click();
  await page.getByRole('button', { name: 'Close menu' }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(380, 500);
  await expect(page.getByRole('dialog', { name: 'Main navigation' })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(previousOverflow);
});

test('choosing a destination closes the drawer and moves focus to page content', async ({ page }) => {
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('dialog', { name: 'Main navigation' }).getByRole('link', { name: 'My profile' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Main navigation' })).toHaveCount(0);
  await expect(page.locator('main')).toBeFocused();
});

test('logo closes the drawer even when already on the dashboard', async ({ page }) => {
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('dialog', { name: 'Main navigation' }).locator('a').first().click();
  await expect(page.getByRole('dialog', { name: 'Main navigation' })).toHaveCount(0);
  await expect(page.locator('main')).toBeFocused();
});

test('resizing to desktop closes the mobile modal without leaving navigation trapped', async ({ page }) => {
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.setViewportSize({ width: 1100, height: 844 });
  await expect(page.getByRole('dialog', { name: 'Main navigation' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.locator('main')).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('skip link and compact drawer remain usable with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 480 });
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const trigger = page.getByRole('button', { name: 'Open menu' });
  expect((await trigger.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Main navigation' });
  expect(await drawer.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  await drawer.getByRole('button', { name: 'Sign out' }).scrollIntoViewIfNeeded();
  await expect(drawer.getByRole('button', { name: 'Sign out' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({ path: test.info().outputPath('mobile-menu.png') });
});

for (const width of [390, 1280]) {
  test(`account row aligns avatar and text at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    if (width < 768) await page.getByRole('button', { name: 'Open menu' }).click();
    const button = page.getByRole('button', { name: 'Sign out', exact: true });
    await expect(button).toBeVisible();
    const layout = await button.evaluate(el => {
      const avatar = el.firstElementChild!.getBoundingClientRect();
      const text = el.lastElementChild!.getBoundingClientRect();
      return { delta: Math.abs(avatar.y + avatar.height / 2 - text.y - text.height / 2), textHeight: text.height, height: el.getBoundingClientRect().height };
    });
    expect(layout.delta).toBeLessThan(1);
    expect(layout.textHeight).toBeLessThanOrEqual(40);
    expect(layout.height).toBeGreaterThanOrEqual(44);
  });
}
