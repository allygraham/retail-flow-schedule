import { test, expect } from '@playwright/test';
import { authenticate, stubApi, storeId, businessId } from './fixtures';
for (const width of [390, 1440]) test(`store details can be edited with retry at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await authenticate(page); await stubApi(page);
  let store = { id: storeId, business_id: businessId, name: 'Main Store', address: '12 High Street', city: 'Edinburgh', postcode: 'EH1 1AA', is_active: true };
  let fail = true;
  const writes: { url: string; body: Record<string, string> }[] = [];
  await page.route('**/rest/v1/store_locations*', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON(); writes.push({ url: route.request().url(), body });
      if (fail) { fail = false; await route.fulfill({ status: 500, json: { message: 'Could not update store' } }); return; }
      store = { ...store, ...body }; await route.fulfill({ json: [{ id: storeId }] }); return;
    }
    await route.fulfill({ json: [store] });
  });
  await page.goto('/stores');
  await page.getByRole('button', { name: 'Edit Main Store', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit store' });
  await expect(dialog.getByLabel('Address', { exact: true })).toHaveValue('12 High Street');
  await dialog.getByLabel('Name', { exact: true }).fill('Updated Store');
  await dialog.getByLabel('City', { exact: true }).fill('Glasgow');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Could not update store');
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Updated Store');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Updated Store', exact: true })).toContainText('Glasgow');
  expect(writes).toHaveLength(2);
  const url = new URL(writes[1].url);
  expect(url.searchParams.get('id')).toBe(`eq.${storeId}`);
  expect(url.searchParams.get('business_id')).toBe(`eq.${businessId}`);
  expect(writes[1].body).toEqual({ name: 'Updated Store', address: '12 High Street', city: 'Glasgow', postcode: 'EH1 1AA' });
  await page.getByRole('button', { name: 'Add store', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add store' }).getByLabel('Name', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  await page.screenshot({ path: test.info().outputPath('stores.png') });
});
