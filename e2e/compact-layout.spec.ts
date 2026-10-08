import { test, expect } from '@playwright/test';
import { authenticate, stubApi, employeeId } from './fixtures';

for (const width of [320, 390, 1280]) {
  test(`staff summaries stay compact and records stay in order at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await authenticate(page); await stubApi(page);
    await page.goto(`/team/${employeeId}`);
    await expect(page.getByRole('heading', { name: 'Test Employee' })).toBeVisible();
    const taken = await page.getByText('Taken', { exact: true }).locator('..').boundingBox();
    const booked = await page.getByText('Booked', { exact: true }).locator('..').boundingBox();
    const pending = await page.getByText('Pending', { exact: true }).locator('..').boundingBox();
    expect(taken!.y).toBe(booked!.y); expect(booked!.y).toBe(pending!.y);
    if (width <= 540) {
      expect(taken!.height).toBeLessThan(180);
      const annual = await page.locator('section[aria-labelledby="leave-summary-title"]').boundingBox();
      const annualRecord = await page.getByRole('region', { name: 'Annual leave record', exact: true }).boundingBox();
      const sick = await page.locator('section[aria-labelledby="sickness-summary-title"]').boundingBox();
      expect(annual!.height).toBeLessThan(280);
      expect(annualRecord!.y).toBeGreaterThan(annual!.y + annual!.height);
      expect(sick!.y).toBeGreaterThan(annualRecord!.y + annualRecord!.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: test.info().outputPath('staff-summary.png'), fullPage: true });
  });

  test(`rota groups navigation and schedule actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await authenticate(page); await stubApi(page);
    await page.goto('/rota');
    const controls = page.getByRole('group', { name: 'Rota controls', exact: true });
    const navigation = controls.getByRole('group', { name: 'Week navigation', exact: true });
    const actions = controls.getByRole('group', { name: 'Schedule actions', exact: true });
    await expect(navigation.getByRole('button', { name: 'Previous week' })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Copy previous week' })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Publish', exact: true })).toBeVisible();
    await expect(controls.getByRole('button', { name: 'Main Store' })).toHaveCount(0);
    if (width <= 540) {
      expect((await actions.boundingBox())!.y).toBeGreaterThan((await navigation.boundingBox())!.y);
      for (const label of ['Previous week', 'Current week', 'Next week']) {
        expect((await navigation.getByRole('button', { name: label, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
    const heading = await page.getByRole('heading', { name: /Week of/ }).textContent();
    await navigation.getByRole('button', { name: 'Next week', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Week of/ })).not.toHaveText(heading!);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: test.info().outputPath('rota-toolbar.png'), fullPage: true });
  });
}

test('employees have week and store controls without manager actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await authenticate(page, employeeId); await stubApi(page);
  await page.goto('/rota');
  await expect(page.getByRole('group', { name: 'Week navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Main Store' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Schedule actions' })).toHaveCount(0);
});
