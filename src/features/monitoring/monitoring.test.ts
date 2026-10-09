import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { privateEvent, monitoringRoute } from './privacy';
import type { ErrorEvent } from '@sentry/react';
const sdk = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }));
vi.mock('@sentry/react', () => sdk);
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
beforeEach(() => { vi.resetModules(); });
it('removes personal fields, tokens, raw messages and frame context while retaining mapped locations', () => {
 history.replaceState(null, '', '/team/private-user?token=secret');
 const event: ErrorEvent = { type: undefined, user: { email: 'person@example.com' }, request: { url: 'https://app.test/?token=secret', data: 'medical detail' }, extra: { sickness: 'medical detail' }, breadcrumbs: [{ message: 'email person@example.com' }], tags: { operation: 'data-load', email: 'person@example.com' }, exception: { values: [{ type: 'TypeError', value: 'person@example.com medical detail', stacktrace: { frames: [{ filename: `${location.origin}/assets/page.js?token=secret`, lineno: 42, colno: 5, vars: { email: 'person@example.com' }, context_line: 'medical detail', function: 'secret' }] } }] }, debug_meta: { images: [{ type: 'sourcemap', code_file: `${location.origin}/assets/page.js?token=secret`, debug_id: '00000000-0000-4000-8000-000000000000' }] } };
 const safe = privateEvent(event); expect(JSON.stringify(safe)).not.toMatch(/person@|secret|medical detail|private-user/);
 expect(safe.tags).toEqual({ route: '/team/:staff', operation: 'data-load' });
 expect(safe.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({ filename: `${location.origin}/assets/page.js`, lineno: 42, colno: 5 });
 expect(safe.debug_meta?.images).toHaveLength(1);
});
it('drops non-application filenames and arbitrary tags', () => {
 const safe = privateEvent({ type: undefined, tags: { operation: 'staff@email.com' }, exception: { values: [{ type: 'SensitiveName', value: 'secret', stacktrace: { frames: [{ filename: 'https://external.test/assets/page.js' }] } }] } });
 expect(safe.tags?.operation).toBe('unexpected-error'); expect(safe.exception?.values?.[0].type).toBe('Error'); expect(safe.exception?.values?.[0].stacktrace?.frames?.[0].filename).toBeUndefined();
 expect(monitoringRoute('/unknown/person@example.com')).toBe('/other');
});
it('does not initialise or send without a production DSN', async () => {
 vi.stubEnv('PROD', true); vi.stubEnv('VITE_SENTRY_DSN', ''); const m = await import('./monitoring'); m.reportError(new Error('secret')); await Promise.resolve(); expect(sdk.init).not.toHaveBeenCalled();
});
it('disables reporting in development even with a DSN', async () => {
 vi.stubEnv('PROD', false); vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o0.ingest.sentry.io/1'); const m = await import('./monitoring'); m.reportError(new Error('secret')); expect(sdk.init).not.toHaveBeenCalled();
});
it('reports once per Error and enables only the private error pipeline', async () => {
 vi.stubEnv('PROD', true); vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o0.ingest.sentry.io/1'); const m = await import('./monitoring'); m.startMonitoring(); const error = new TypeError('secret'); m.reportError(error, 'page-render'); m.reportError(error); await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledTimes(1));
 expect(sdk.init).toHaveBeenCalledWith(expect.objectContaining({ defaultIntegrations: false, maxBreadcrumbs: 0, beforeSend: expect.any(Function), dataCollection: expect.objectContaining({ userInfo: false, httpBodies: [] }) }));
});
it('filters expected validation, permission and cancellation failures', async () => {
 vi.stubEnv('PROD', true); vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o0.ingest.sentry.io/1'); const m = await import('./monitoring'); for (const error of [{ status: 401 }, { code: '23505' }, { code: '42501' }, { name: 'AbortError' }, { code: 'invalid_credentials' }]) m.reportError(error); expect(sdk.captureException).not.toHaveBeenCalled(); expect(sdk.init).not.toHaveBeenCalled();
});
it('installs listeners once without downloading the SDK until an unexpected failure', async () => {
 vi.stubEnv('PROD', true); vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o0.ingest.sentry.io/1');
 const listen = vi.spyOn(window, 'addEventListener'); const m = await import('./monitoring'); m.startMonitoring(); m.startMonitoring();
 expect(listen.mock.calls.filter(([type]) => type === 'error')).toHaveLength(1);
 expect(listen.mock.calls.filter(([type]) => type === 'unhandledrejection')).toHaveLength(1);
 expect(sdk.init).not.toHaveBeenCalled();
 const handler = listen.mock.calls.find(([type]) => type === 'error')![1] as EventListener;
 handler(new ErrorEvent('error', { error: new TypeError('private') }));
 await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledTimes(1));
 expect(sdk.captureException).toHaveBeenCalledWith(expect.any(TypeError), { tags: { operation: 'browser-error' } });
 const options = sdk.init.mock.calls[0][0]; expect(options.beforeSend({ type: undefined }, { originalException: { status: 401 } })).toBeNull();
 listen.mockRestore();
});
it('monitoring transport failures cannot reject a form operation', async () => {
 vi.stubEnv('PROD', true); vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o0.ingest.sentry.io/1'); sdk.captureException.mockImplementationOnce(() => { throw new Error('offline'); }); const m = await import('./monitoring'); expect(() => m.reportError(new Error('failure'))).not.toThrow(); await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledTimes(1));
});
