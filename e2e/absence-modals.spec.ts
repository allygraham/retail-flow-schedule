import { test, expect } from '@playwright/test';
import { authenticate, stubApi, businessId, employeeId } from './fixtures';
const absence = { id: '66666666-6666-4666-8666-666666666666', business_id: businessId, user_id: employeeId, leave_type: 'sick', source: 'employee_request', status: 'pending', start_date: '2026-10-14', end_date: '2026-10-14', created_at: '2026-10-07', reason: 'Recovering at home', manager_note: 'Check in tomorrow', lifecycle_status: 'recorded_absence', sickness_meta: { category: 'cold_flu', self_certified: true, paid_absence: false } };
for (const width of [320, 390, 1440]) {
  test(`absence facts and manager tools fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await authenticate(page); const state = await stubApi(page); state.leaves = [absence];
    await page.goto('/leave');
    if (width < 1024) await page.getByRole('button', { name: /^Open details for/ }).first().click();
    else await page.getByRole('row').filter({ hasText: 'Test Employee' }).click();
    const dialog = page.getByRole('dialog', { name: 'Absence details' });
    await expect(dialog.getByText('Recovering at home')).toBeVisible();
    await expect(dialog.getByText('14 Oct 2026', { exact: true })).toBeVisible();
    await expect(dialog.locator('dl > div').filter({ hasText: 'Paid absence' })).toHaveText('Paid absenceNo');
    await expect(dialog.locator('dl > div').filter({ hasText: 'Fit note received' })).toHaveCount(0);
    await expect(dialog.getByLabel('Sickness status')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Shift cover' })).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog.getByRole('button', { name: /SSP estimate/ })).toHaveAttribute('aria-expanded', 'false');
    await page.screenshot({ path: test.info().outputPath(`absence-overview-${width}.png`) });
    await dialog.getByRole('button', { name: 'Notes & history' }).click();
    await expect(dialog.getByText('Check in tomorrow')).toBeVisible();
    await dialog.getByRole('contentinfo').getByRole('button', { name: 'Close', exact: true }).scrollIntoViewIfNeeded();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`absence-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}
test('employee sickness record is read-only and exposes no manager tools', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page, employeeId); const state = await stubApi(page); state.role = 'employee'; state.leaves = [absence];
  await page.goto('/leave');
  await page.getByRole('tab', { name: /^Sickness/ }).click();
  await page.getByRole('button', { name: /^Open details for/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Recovering at home')).toBeVisible();
  await expect(dialog.getByLabel('Sickness status')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Shift cover|SSP estimate/ })).toHaveCount(0);
});
test('recording sickness opens relevant fields immediately and annual leave hides them', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page); await stubApi(page); await page.goto('/leave');
  await page.getByRole('button', { name: 'Add leave', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add leave or absence' });
  await dialog.getByLabel('Leave type').selectOption('sick');
  await expect(dialog.getByLabel('Category')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Sickness details/ })).toHaveAttribute('aria-expanded', 'true');
  await dialog.getByLabel('Self-certified', { exact: true }).check();
  const dateTrigger = dialog.getByRole('button', { name: 'Dates', exact: true });
  await dateTrigger.click();
  const calendar = page.getByRole('dialog', { name: 'Choose date', exact: true });
  await expect(calendar).toBeVisible();
  expect(await calendar.evaluate(el => el.parentElement === document.body)).toBe(true);
  await calendar.getByRole('button', { name: /next month/i }).click();
  await page.keyboard.press('Escape'); await expect(calendar).toHaveCount(0);
  await expect(dateTrigger).toBeFocused();
  await dialog.getByRole('button', { name: 'Save as approved' }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Save as approved' })).toBeInViewport();
  await dialog.getByLabel('Leave type').selectOption('annual');
  await expect(dialog.getByLabel('Category')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('record-absence-mobile.png') });
});

test('failed sickness-status updates preserve the saved value and allow retry', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page); state.leaves = [absence];
  let fail = true;
  await page.route('**/rest/v1/leave_requests*', async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    if (fail) return route.fulfill({ status: 500, json: { message: 'Status could not be saved' } });
    const patch = route.request().postDataJSON(); state.leaves[0] = { ...state.leaves[0], ...patch };
    await route.fulfill({ status: 204 });
  });
  await page.goto('/leave');
  await page.getByRole('row').filter({ hasText: 'Test Employee' }).click();
  const status = page.getByRole('dialog').getByLabel('Sickness status');
  await status.selectOption('returned_to_work');
  await expect(page.getByText('Status could not be saved')).toBeVisible();
  await expect(status).toHaveValue('recorded_absence'); await expect(status).toBeEnabled();
  fail = false; await status.selectOption('returned_to_work');
  await expect(status).toHaveValue('returned_to_work'); await expect(status).toBeEnabled();
});
test('annual leave keeps the overview compact without sickness controls', async ({ page }) => {
  await authenticate(page); const state = await stubApi(page);
  state.leaves = [{ ...absence, leave_type: 'annual', sickness_meta: null, manager_note: null }];
  await page.goto('/leave'); await page.getByRole('row').filter({ hasText: 'Test Employee' }).getByRole('cell').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Recovering at home')).toBeVisible();
  await expect(dialog.getByLabel('Sickness status')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Notes & history|SSP estimate/ })).toHaveCount(0);
  expect((await dialog.boundingBox())!.height).toBeLessThan(600);
  for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
  await page.screenshot({ path: test.info().outputPath('annual-leave-desktop.png') });
});
