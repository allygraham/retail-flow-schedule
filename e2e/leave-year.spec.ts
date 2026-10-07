import { test, expect } from '@playwright/test';
import { authenticate, stubApi, business, businessId } from './fixtures';

test('owner saves a business-wide leave year and staff history follows it', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'));
  await authenticate(page); const state = await stubApi(page);
  let config = { leave_year_mode: 'calendar', leave_year_start_date: null as string | null };
  await page.route('**/rest/v1/memberships*', route => {
    const url = new URL(route.request().url());
    if (!url.searchParams.get('select')?.includes('businesses')) return route.fallback();
    const row = { business_id: businessId, businesses: { ...business, ...config } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().headers().accept?.includes('object+json') ? row : [row]) });
  });
  await page.route('**/rest/v1/businesses*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    config = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: businessId }]) });
  });
  await page.goto('/settings');
  await page.getByLabel('Leave year type', { exact: true }).selectOption('tax');
  await page.getByRole('button', { name: 'Save leave year' }).click();
  await expect(page.getByLabel('Leave year type', { exact: true })).toHaveValue('tax');
  await expect(page.getByText(/Current leave year:/)).toContainText('6 Apr 2026');
  await page.getByLabel('Leave year type', { exact: true }).selectOption('financial');
  await page.getByRole('button', { name: 'Save leave year' }).click();
  await expect(page.getByRole('alert')).toContainText('Choose the financial year start date');
  await page.getByRole('button', { name: 'Financial year start date', exact: true }).click();
  await page.getByRole('dialog', { name: 'Choose date' }).getByRole('button', { name: /Monday, October 5th, 2026/ }).click();
  await page.getByRole('button', { name: 'Save leave year' }).click();
  await expect(page.getByText(/Current leave year:/)).toContainText('5 Oct 2026');
  expect(config).toEqual({ leave_year_mode: 'financial', leave_year_start_date: '2026-10-05' });
  await page.goto('/team/22222222-2222-4222-8222-222222222222');
  await expect(page.getByLabel('Year', { exact: true })).toContainText('5 Oct 2026 – 4 Oct 2027');
  state.role = 'employee';
  await page.goto('/leave');
  await expect(page.getByText('5 Oct 2026 – 4 Oct 2027 entitlement')).toBeVisible();
});
