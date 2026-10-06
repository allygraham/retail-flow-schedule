import { test, expect } from '@playwright/test';
import { authenticate, stubApi } from './fixtures';

test('logged-out home visitors go straight to login without publishing demo access', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rotas that run themselves.' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('@lavoro.demo');
  await expect(page.locator('body')).not.toContainText('LavoroDemo123!');
});

test('signed-in home visitors go to their dashboard', async ({ page }) => {
  await stubApi(page);
  await authenticate(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toHaveCount(0);
});
