import { test, expect } from '@playwright/test';
import { stubApi } from './fixtures';

for (const screen of [
  { path: '/login', heading: 'Welcome back' },
  { path: '/signup', heading: 'Create your workspace' },
  { path: '/forgot-password', heading: 'Forgot password' },
  { path: '/reset-password', heading: 'Set a new password' },
  { path: '/accept-invite?token=test-invite', heading: 'Join Test Shop' },
]) test(`${screen.path} renders without downloading validation`, async ({ page }) => {
  await stubApi(page);
  const requests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/src/lib/validation.ts')) requests.push(request.url());
  });
  await page.goto(screen.path);
  await expect(page.getByRole('heading', { name: screen.heading, exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
});

test('login keeps entered values and shows pending state while validation downloads', async ({ page }) => {
  await stubApi(page);
  let release!: () => void;
  let requested!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  const requestStarted = new Promise<void>(resolve => { requested = resolve; });
  await page.route('**/src/lib/validation.ts*', async route => {
    requested(); await ready; await route.continue();
  });
  await page.goto('/login');
  await page.locator('input[type=email]').fill('owner@example.test');
  await page.locator('input[type=password]').fill('BrowserTestPassword123!');
  const submit = page.getByRole('button', { name: 'Sign in', exact: true });
  await submit.click();
  try {
    await requestStarted;
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.locator('input[type=email]')).toHaveValue('owner@example.test');
  } finally { release(); }
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('failed validation download shows an error without submitting credentials', async ({ page }) => {
  await stubApi(page);
  let signIns = 0;
  page.on('request', request => { if (request.url().includes('/auth/v1/token')) signIns++; });
  await page.route('**/src/lib/validation.ts*', route => route.abort());
  await page.goto('/login');
  await page.locator('input[type=email]').fill('owner@example.test');
  await page.locator('input[type=password]').fill('BrowserTestPassword123!');
  const submit = page.getByRole('button', { name: 'Sign in', exact: true });
  await submit.click();
  await expect(page.getByText('Could not load form validation. Please try again.')).toBeVisible();
  await expect(submit).toBeEnabled();
  expect(signIns).toBe(0);
});
