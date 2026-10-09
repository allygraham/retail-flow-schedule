import { privateEvent } from './privacy';

const publicDsn = 'https://b7f772cf7f55b5e4c76c95d491ed579c@o4512226936553472.ingest.de.sentry.io/4512226943238224';
const reported = new WeakSet<object>();
let started = false;
let windowStart = 0;
let count = 0;
function configured() { return import.meta.env.PROD && (import.meta.env.VITE_SENTRY_DSN ?? publicDsn); }
export function expectedFailure(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const details = error as { name?: string; status?: number; code?: string };
  return details.name === 'AbortError' || (typeof details.status === 'number' && details.status >= 400 && details.status < 500) ||
    (typeof details.code === 'string' && (/^(22|23|28)/.test(details.code) || ['42501', 'PGRST116', 'invalid_credentials', 'email_not_confirmed', 'user_already_exists', 'over_email_send_rate_limit'].includes(details.code)));
}
let sdk: Promise<typeof import('@sentry/react')> | undefined;
function loadSdk() {
  sdk ??= import('@sentry/react').then(sentry => {
    sentry.init({ dsn: configured() || undefined,
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? 'production', release: import.meta.env.VITE_SENTRY_RELEASE,
      defaultIntegrations: false, maxBreadcrumbs: 0,
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, databaseQueryData: false },
      beforeSend: (event, hint) => {
        if (expectedFailure(hint.originalException)) return null;
        const now = Date.now(); if (now - windowStart > 60000) { windowStart = now; count = 0; }
        return ++count > 20 ? null : privateEvent(event);
      },
    });
    return sentry;
  }).catch(error => { sdk = undefined; throw error; });
  return sdk;
}
/** Install lightweight listeners before app imports; load the SDK only on failure. */
export function startMonitoring() {
  if (!configured() || started) return;
  started = true;
  window.addEventListener('error', event => reportError(event.error ?? new Error('Browser operation failed'), 'browser-error'));
  window.addEventListener('unhandledrejection', event => reportError(event.reason, 'unhandled-rejection'));
}
export function reportError(error: unknown, operation = 'unexpected-error') {
  if (!configured() || expectedFailure(error)) return;
  if (error && typeof error === 'object') { if (reported.has(error)) return; reported.add(error); }
  void loadSdk().then(sentry => {
    sentry.captureException(error instanceof Error ? error : new Error('Operation failed'), { tags: { operation } });
  }).catch(() => { /* Monitoring must never block application operations. */ });
}
