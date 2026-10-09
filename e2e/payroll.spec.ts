import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { authenticate, stubApi, employeeId, businessId } from './fixtures';
const row = { user_id: employeeId, full_name: 'Test Employee', email: 'employee@example.test', shift_count: 2, scheduled_minutes: 905, annual_leave_days: 2, sickness_days: 3 };
for (const width of [1280, 390]) {
  test(`payroll preview and CSV download at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 }); await page.clock.setFixedTime(new Date('2026-11-15T12:00:00Z'));
    await authenticate(page); await stubApi(page);
    const requests: Record<string, unknown>[] = [];
    let calls = 0;
    await page.route('**/rest/v1/rpc/get_payroll_export', async route => { requests.push(route.request().postDataJSON()); calls++; await route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ ...row, scheduled_minutes: calls === 1 ? 905 : 60 }]) }); });
    await page.goto('/payroll'); await expect(page.getByText('Test Employee', { exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: '15.08', exact: true }).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('payroll-preview.png'), fullPage: true });
    const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download CSV' }).click();
    const download = await downloaded; expect(download.suggestedFilename()).toBe('lavoro-payroll-2026-10-01-to-2026-10-31.csv');
    const csv = await readFile((await download.path())!, 'utf8');
    expect(csv).toContain('"1.00","2","3"'); expect(csv).toContain('Scheduled hours after breaks');
    expect(calls).toBe(2);
    expect(requests.at(-1)).toEqual({ _business_id: businessId, _start_date: '2026-10-01', _end_date: '2026-10-31' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('date range selection triggers a new preview and does not export stale rows', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-15T12:00:00Z')); await authenticate(page); await stubApi(page);
  await page.route('**/rest/v1/rpc/get_payroll_export', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([row]) }));
  await page.goto('/payroll'); await expect(page.getByText('Test Employee', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'From date', exact: true }).click();
  const request = page.waitForRequest(r => r.url().includes('get_payroll_export') && r.postDataJSON()?._start_date === '2026-10-05');
  await page.getByRole('dialog', { name: 'Choose date' }).getByRole('button', { name: /October 5th, 2026/ }).click(); await request;
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeEnabled();
});
test('failed payroll loads show retry and empty periods cannot be exported', async ({ page }) => {
  await authenticate(page); await stubApi(page); let fail = true;
  await page.route('**/rest/v1/rpc/get_payroll_export', route => route.fulfill({ status: fail ? 400 : 200, contentType: 'application/json', body: JSON.stringify(fail ? { message: 'Saved working pattern is missing' } : []) }));
  await page.goto('/payroll'); await expect(page.getByRole('alert')).toContainText('Saved working pattern is missing');
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
  fail = false; await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('No payroll records')).toBeVisible(); await expect(page.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
});
for (const role of ['owner', 'admin', 'manager', 'employee'] as const) {
  test(`${role} payroll access is enforced`, async ({ page }) => {
    await authenticate(page); const state = await stubApi(page); state.role = role;
    let calls = 0; await page.route('**/rest/v1/rpc/get_payroll_export', route => { calls++; return route.fulfill({ contentType: 'application/json', body: JSON.stringify([row]) }); });
    await page.goto('/payroll');
    if (role === 'owner' || role === 'admin') { await expect(page.getByRole('heading', { name: 'Payroll export' })).toBeVisible(); await expect(page.getByText('Test Employee', { exact: true })).toBeVisible(); expect(calls).toBe(1); }
    else { await expect(page.getByText('Access denied', { exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: 'Payroll', exact: true })).toHaveCount(0); expect(calls).toBe(0); }
  });
}
