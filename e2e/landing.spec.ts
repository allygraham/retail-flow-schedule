import { test, expect } from '@playwright/test';

test('landing page offers signup and sign-in without publishing demo access', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Rotas that run themselves.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start free trial' })).toHaveAttribute('href', '/signup');
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login');
  await expect(page.getByRole('link', { name: /demo/i })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Demo logins:');
  await expect(page.locator('body')).not.toContainText('@lavoro.demo');
  await expect(page.locator('body')).not.toContainText('LavoroDemo123!');
});
