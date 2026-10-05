import { test, expect } from '@playwright/test';
import { authenticate, stubApi } from './fixtures';

test('expired reset link cannot update a password, even with an existing session', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page);
  await page.goto('/reset-password#error=access_denied&error_code=otp_expired');
  await expect(page.getByText(/invalid or has expired/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update password' })).toHaveCount(0);
  expect(state.writes.filter(write => write.endpoint === 'user')).toHaveLength(0);
});
test('reset requests report throttling, allow retry and preserve privacy', async ({ page }) => {
  const state = await stubApi(page); state.recoveryFailure = true;
  await page.goto('/forgot-password');
  await page.locator('input[type=email]').fill('person@example.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/Too many requests/)).toBeVisible();
  state.recoveryFailure = false;
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/If an account exists/)).toBeVisible();
});
test('failed password updates and logout can be retried independently', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page); state.passwordFailure = true;
  await page.goto('/reset-password');
  await page.locator('input[type=password]').nth(0).fill('NewPassword123!');
  await page.locator('input[type=password]').nth(1).fill('NewPassword123!');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Password update failed')).toBeVisible();
  await expect(page).toHaveURL(/reset-password$/);
  state.passwordFailure = false; state.logoutFailure = true;
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('alert')).toContainText('other sessions could not be signed out');
  const passwordWrites = state.writes.filter(write => write.endpoint === 'user').length;
  state.logoutFailure = false;
  await page.getByRole('link', { name: 'Continue to sign in' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(state.writes.filter(write => write.endpoint === 'user')).toHaveLength(passwordWrites);
});
test('remote logout failure reports local logout accurately and returns to login', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page); state.logoutFailure = true;
  await page.goto('/rota');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('You are signed out on this device, but other sessions');
  await expect(page).toHaveURL(/\/login$/);
});
test('successful app logout returns directly to login', async ({ page }) => {
  await authenticate(page); await stubApi(page);
  await page.goto('/rota');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
