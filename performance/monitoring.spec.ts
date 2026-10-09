import { test, expect } from '@playwright/test';
import { stubApi } from '../e2e/fixtures';
test('Sentry loads after a failure, strips sensitive data and leaves the app usable', async ({ page }) => {
 await stubApi(page); const scripts: string[] = []; const envelopes: string[] = [];
 page.on('request', request => { if (request.url().endsWith('.js')) scripts.push(request.url()); });
 await page.route('https://o0.ingest.sentry.io/**', route => { envelopes.push(route.request().postData() ?? ''); return route.fulfill({ json: {}, headers: { 'Access-Control-Allow-Origin': '*' } }); });
 await page.route('**/_vercel/**', route => route.abort());
 await page.goto('/login?token=private-invite-token'); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
 const initialScripts = new Set(scripts); expect(envelopes).toHaveLength(0);
 await page.evaluate(() => { setTimeout(() => { throw new TypeError('private@example.com sickness detail private-invite-token'); }, 0); });
 await expect.poll(() => envelopes.length).toBeGreaterThan(0);
 expect(scripts.some(url => !initialScripts.has(url))).toBe(true);
 const reports = envelopes.join('\n'); expect(reports).not.toMatch(/private@example|sickness detail|private-invite-token/); expect(reports).toContain('Unexpected application failure'); expect(reports).toContain('browser-error');
 await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});
