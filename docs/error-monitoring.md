# Production error monitoring

Sentry reports page-render failures, uncaught JavaScript errors, unhandled promise rejections, shared database operation failures, shared handled-operation failures and data-load/account-load failures. Expected cancellation, HTTP 4xx, input/integrity constraints and permission failures are filtered. Local development is disabled. Reporting is capped at 20 events per browser per minute; repeated reports of the same Error object are deduplicated.

The SDK loads on the first reported failure, not during initial page loading. That preserves load budgets, but the first report can be lost if the user closes the page immediately or the lazy SDK/network is unavailable. Error reporting cannot block application operations. There are no replay, tracing, profiling, automatic breadcrumbs, console collection or user identifiers. This is error monitoring, not uptime monitoring or proof of notification delivery.

Before sending, events are rebuilt from an allowlist. Raw messages, stack-frame source text, local variables, user identity, request data, query strings, fragments, arbitrary tags and breadcrumbs are discarded. Reports retain a generic failure, source asset and line/column, app release, a predefined operation name and a normalised route. Staff routes use `/team/:staff`; unknown paths use `/other`. Browser IP addresses are still visible to the network ingestion service; configure Sentry's project IP-storage/data-scrubbing settings and retention as appropriate. Do not enable additional integrations without reviewing their data collection.

## Configuration

The public DSN supplied for `ally-graham` / `javascript-react` is configured in the frontend. An optional `VITE_SENTRY_DSN` overrides it; an explicit empty value disables reporting. Development builds are disabled even with a DSN. The lightweight error-only setup was selected to preserve the existing mobile loading budgets; performance tracing is deferred.

1. Review the project's IP-storage, data-scrubbing and retention settings in Sentry.
2. Optionally set `VITE_SENTRY_ENVIRONMENT=production` in Vercel. Redeploy after changing build-time variables.
3. For source maps add `SENTRY_ORG=ally-graham`, `SENTRY_PROJECT=javascript-react`, and `SENTRY_AUTH_TOKEN` (Sentry's source-map upload token) as private Production build variables. Never use a `VITE_` prefix for the token and never commit it. The Vite plugin builds hidden maps only when all three variables are present, uploads them and removes map files from `dist`. An upload failure stops the build. Runtime and upload use the Vercel commit SHA as release; GitHub builds use `GITHUB_SHA`, or local builds can supply `VITE_SENTRY_RELEASE`.
4. For the invitation Edge Function, add `SENTRY_DSN` through Supabase's Edge Function secrets settings, plus optional `SENTRY_RELEASE`, and deploy only `invite-employee`. Backend reporting sends a generic invitation failure on HTTP 5xx without request data or raw database errors. It uses isolated capture calls with automatic integrations disabled. Existing validation/permission responses do not generate events. This does not monitor other Supabase services automatically.
5. Configure an issue alert for new production errors and a recurring/error-volume alert if supported by the chosen plan. Choose the actual recipient in Sentry; the repository does not create alerts or send email itself.
6. Verify with a controlled error in a local production build using a disposable project/test DSN; confirm the event arrives, its release is correct, the source line is mapped, and sensitive fields are absent. Confirm there are no publicly served `.map` files. Then check a real production failure/report if one occurs. Never trigger staff writes merely to test monitoring.

Source-map upload credentials and alert recipients require Sentry and hosting account configuration. The public DSN permits event ingestion but does not grant project management or source-map upload access.

## Regression checks

`src/features/monitoring/monitoring.test.ts` covers privacy, expected errors, disabled environments, duplicate reports, early listener installation and transport failures. `npm run test:performance` builds with a fake test DSN; its browser test intercepts ingestion locally and verifies redaction, lazy loading and continued usability. Loading budgets run with monitoring configured, so they measure the real startup wrapper rather than a disabled integration. No test events are sent to a real Sentry project.
