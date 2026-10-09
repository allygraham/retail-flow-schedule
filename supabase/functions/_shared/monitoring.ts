// Per-call context only: never retain request data in the shared Edge runtime.
let sdk: Promise<typeof import('npm:@sentry/deno@11.6.0')> | undefined;
export async function reportInvitationFailure() {
  const dsn = Deno.env.get('SENTRY_DSN');
  if (!dsn) return;
  try {
    sdk ??= import('npm:@sentry/deno@11.6.0').then(sentry => {
      sentry.init({ dsn, defaultIntegrations: false,
        environment: 'production', release: Deno.env.get('SENTRY_RELEASE'),
        dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, databaseQueryData: false },
        beforeSend: event => ({ type: undefined, event_id: event.event_id, timestamp: event.timestamp, platform: 'javascript', level: 'error', release: event.release, environment: 'production', message: 'Employee invitation function failed', tags: { operation: 'invite-employee' } }),
      });
      return sentry;
    }).catch(error => { sdk = undefined; throw error; });
    const sentry = await sdk;
    sentry.captureMessage('Employee invitation function failed', 'error');
    await sentry.flush(1500);
  } catch { /* Monitoring failure must not alter the API response. */ }
}
