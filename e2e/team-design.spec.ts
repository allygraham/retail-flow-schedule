import { test, expect } from '@playwright/test';
import { authenticate, stubApi, storeId, employeeId } from './fixtures';
for (const width of [320, 390, 1440]) {
  for (const multiple of [false, true]) {
    test(`team directory at ${width}px with ${multiple ? 'multiple stores' : 'one store'}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 950 });
      await authenticate(page); await stubApi(page);
      if (multiple) await page.route('**/rest/v1/store_locations*', route => route.fulfill({ json: [{ id: storeId, name: 'Main Store' }, { id: 'second', name: 'Second Store' }] }));
      await page.goto('/team');
      const directory = page.getByRole('region', { name: 'Team members' });
      await expect(directory.getByText('employee@example.test', { exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Search team' })).toBeVisible();
      if (width >= 1024) await expect(page.getByRole('columnheader', { name: 'Primary store' })).toHaveCount(multiple ? 1 : 0);
      else await expect(directory.getByText('Main Store', { exact: true })).toHaveCount(multiple ? 1 : 0);
      await page.getByRole('button', { name: width < 1024 ? 'Open filters' : 'Filters', exact: true }).click();
      const controls = width < 1024 ? page.getByRole('dialog', { name: 'Filters' }) : directory;
      await expect(controls.getByLabel('Store', { exact: true })).toHaveCount(multiple ? 1 : 0);
      if (multiple) {
        await controls.getByLabel('Store', { exact: true }).selectOption('second');
        if (width < 1024) await controls.getByRole('button', { name: 'Apply', exact: true }).click();
        await expect(page.getByText('No matches', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
      } else if (width < 1024) await controls.getByRole('button', { name: 'Apply', exact: true }).click();
      await page.getByRole('button', { name: 'Edit leave entitlement for Test Employee' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('spinbutton', { name: 'Leave entitlement for Test Employee' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('spinbutton', { name: 'Leave entitlement for Test Employee' })).toHaveCount(0);
      await expect(directory.getByRole('link', { name: 'Test Employee', exact: true })).toHaveAttribute('href', `/team/${employeeId}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: test.info().outputPath('team-directory.png'), fullPage: true });
    });
  }
}
