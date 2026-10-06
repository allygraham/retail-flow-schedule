import { test, expect } from '@playwright/test';
import { authenticate, stubApi } from './fixtures';

for (const role of ['owner', 'employee'] as const) {
  test(`${role} dashboard keeps its cards and static content while data loads`, async ({ page }) => {
    await authenticate(page);
    const state = await stubApi(page); state.role = role;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/rest/v1/shifts*', async route => { await pending; await route.fallback(); });
    await page.goto('/dashboard');
    const titles = role === 'owner'
      ? ["Today's shifts", 'Pending leave requests', 'Coverage gaps', 'Working today', 'On annual leave', 'Off sick', 'Unassigned shifts', 'Pending requests']
      : ['This week', 'Time off', 'Recent updates', 'Then after that', 'Your next shift'];
    const firstTitle = page.getByText(titles[0], { exact: true });
    try {
      for (const title of titles) await expect(page.getByText(title, { exact: true })).toBeVisible();
      await expect(page.getByRole('status', { name: 'Loading dashboard', exact: true })).toHaveCount(0);
      await expect(page.getByText(/No shifts today|No upcoming shifts|No leave on record|No further shifts|Day off/)).toHaveCount(0);
      if (role === 'employee') {
        await expect(page.getByRole('button', { name: 'View full rota' })).toBeVisible();
        await expect(page.getByText('Mon', { exact: true })).toBeVisible();
        await expect(page.getByText('Sun', { exact: true })).toBeVisible();
      }
      await firstTitle.evaluate(element => { element.setAttribute('data-static-title', 'retained'); });
    } finally { release(); }
    await expect(firstTitle).toHaveAttribute('data-static-title', 'retained');
    await expect(page.getByRole('status', { name: /Loading (today’s shifts|time off)/ })).toHaveCount(0);
    for (const title of titles.filter(title => title !== 'Your next shift')) await expect(page.getByText(title, { exact: true })).toBeVisible();
  });
}
