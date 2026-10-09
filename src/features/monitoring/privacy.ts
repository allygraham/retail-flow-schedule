import type { ErrorEvent } from '@sentry/react';

const routes = new Set(['/', '/login', '/signup', '/forgot-password', '/reset-password', '/accept-invite', '/dashboard', '/rota', '/shift-changes', '/leave', '/profile', '/team', '/payroll', '/history', '/stores', '/settings']);
export function monitoringRoute(path: string) {
  if (/^\/team\/[^/]+$/.test(path)) return '/team/:staff';
  return routes.has(path) ? path : '/other';
}
function safeFile(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try { const url = new URL(value, window.location.origin); return url.origin === window.location.origin && /^\/assets\/[\w.-]+\.js$/.test(url.pathname) ? `${url.origin}${url.pathname}` : undefined; } catch { return undefined; }
}
const errorTypes = new Set(['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'URIError']);
/** Rebuild from an allowlist: no messages, identities, URLs, breadcrumbs or payloads. */
export function privateEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined, event_id: event.event_id, timestamp: event.timestamp, platform: 'javascript', level: 'error',
    release: event.release, environment: event.environment,
    tags: { route: monitoringRoute(window.location.pathname), operation: typeof event.tags?.operation === 'string' && /^[a-z-]{1,40}$/.test(event.tags.operation) ? event.tags.operation : 'unexpected-error' },
    exception: { values: event.exception?.values?.map(value => ({
      type: errorTypes.has(value.type ?? '') ? value.type : 'Error', value: 'Unexpected application failure',
      stacktrace: { frames: value.stacktrace?.frames?.map(frame => ({
        filename: safeFile(frame.filename),
        function: undefined, lineno: frame.lineno, colno: frame.colno, in_app: frame.in_app,
      })) },
    })) },
    debug_meta: event.debug_meta ? { images: event.debug_meta.images?.flatMap(image => image.type === 'sourcemap' && /^[\da-f-]{36}$/i.test(image.debug_id) && safeFile(image.code_file) ? [{ type: 'sourcemap' as const, debug_id: image.debug_id, code_file: safeFile(image.code_file)! }] : []) } : undefined,
  };
}
