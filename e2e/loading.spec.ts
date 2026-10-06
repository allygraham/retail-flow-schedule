import { test, expect } from '@playwright/test';
import { authenticate, stubApi } from './fixtures';

for (const scenario of [
  { path: '/profile', endpoint: 'shifts', label: 'Loading profile', heading: 'Your details' },
  { path: '/stores', endpoint: 'store_locations', label: 'Loading stores', heading: 'Your locations' },
  { path: '/dashboard', endpoint: 'shifts', label: 'Loading today’s shifts', heading: /Good/ },
  { path: '/rota', endpoint: 'get_rota_people', label: 'Loading rota', heading: /Week of/ },
  { path: '/team', endpoint: 'employee_profiles', label: 'Loading team', heading: 'Your people' },
]) test(`${scenario.path} shows a skeleton until its data is ready`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page); await stubApi(page);
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.hostname === 'example.supabase.co' && url.pathname.endsWith(`/${scenario.endpoint}`), async route => { await ready; await route.fallback(); });
  await page.goto(scenario.path);
  const skeleton = page.getByRole('status', { name: scenario.label, exact: true });
  try {
    await expect(skeleton).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    await expect(page.getByRole('heading', { name: scenario.heading })).toBeVisible();
    await expect(skeleton).toHaveAttribute('aria-busy', 'true');
    await page.screenshot({ path: test.info().outputPath('loading.png') });
    await expect(skeleton.getByRole('button')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  } finally { release(); }
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByRole('heading', { name: scenario.heading })).toBeVisible();
});

test('app navigation stays mounted while account and page data load', async ({ page }) => {
  await authenticate(page); await stubApi(page);
  let releaseAccount!: () => void;
  const accountReady = new Promise<void>(resolve => { releaseAccount = resolve; });
  await page.route(url => url.hostname === 'example.supabase.co' && url.pathname.endsWith('/memberships'), async route => { await accountReady; await route.fallback(); });
  await page.goto('/rota');
  const navigation = page.getByRole('navigation').filter({ visible: true });
  try {
    await expect(navigation.getByRole('link', { name: 'Rota', exact: true })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading account', exact: true })).toBeVisible();
  } finally { releaseAccount(); }
  await expect(page.getByRole('heading', { name: /Week of/ })).toBeVisible();
  const shell = await navigation.elementHandle();
  await navigation.getByRole('link', { name: 'Team', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your people' })).toBeVisible();
  expect(await shell?.evaluate(el => el.isConnected)).toBe(true);
});


test('public login defers the signed-in shell until entering the app', async ({ page }) => {
  await authenticate(page); await stubApi(page);
  const shellRequests: string[] = [];
  page.on('request', request => {
    if (decodeURIComponent(request.url()).includes('/AppShell.tsx')) shellRequests.push(request.url());
  });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(shellRequests).toHaveLength(0);
  await expect(page.getByRole('region', { name: /Notifications/ })).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Good/ })).toBeVisible();
  expect(shellRequests.length).toBeGreaterThan(0);
  await expect(page.getByRole('region', { name: /Notifications/ })).toHaveCount(1);
});

test('loading a new page module preserves the existing navigation', async ({ page }) => {
  await authenticate(page); await stubApi(page);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Good/ })).toBeVisible();
  const navigation = page.getByRole('navigation').filter({ visible: true });
  const shell = await navigation.elementHandle();
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  let requested!: () => void;
  const moduleRequested = new Promise<void>(resolve => { requested = resolve; });
  await page.route(url => decodeURIComponent(url.pathname).endsWith('/Team.tsx'), async route => {
    requested();
    await ready; await route.continue();
  });
  await navigation.getByRole('link', { name: 'Team', exact: true }).click();
  try {
    await moduleRequested;
    await expect(page.getByRole('heading', { name: /Good/ })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
    expect(await shell?.evaluate(el => el.isConnected)).toBe(true);
  } finally { release(); }
  await expect(page.getByRole('heading', { name: 'Your people' })).toBeVisible();
  expect(await shell?.evaluate(el => el.isConnected)).toBe(true);
});
