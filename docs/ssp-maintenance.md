# Updating SSP rules

Reviewed policies live in `src/features/leave/sspPolicies.json`. Only 2026/27 is currently enabled. Never copy last year’s cap into an unreviewed year.

Before each 6 April, review HMRC rates, manual calculation guidance and transition guidance. Add a dated policy with its official source and actual review date. Retain historical policies so past absences remain reproducible. Each policy must have a unique ID and contiguous, non-overlapping dates.

The current engine supports first-day payments, 80% of the original linked-series earnings, a dated weekly cap, constant qualifying weekdays and a shared 28-week limit. It sums unrounded daily amounts within each Sunday–Saturday week before rounding up to pence. Review rate-change and rounding guidance explicitly before enabling a new year. New eligibility rules, earnings percentages, waiting days or entitlement limits need a new calculation version and transition tests, not just a JSON edit.

Run `npm run check:ssp`, SSP unit/component tests and deployment checks. Compare boundary examples against official guidance, including absences crossing 5/6 April, linked periods, low earnings, partial weeks and exhausted entitlement. Future-year tests use fictional policies passed only to the engine; they do not enable those years in production.

Deployment checks emit a warning from 90 days before the latest reviewed policy ends, and whenever today has no reviewed policy. A warning does not block deployment of unrelated fixes; malformed policies fail the check. Unsupported absence dates and unimplemented rule transitions remain blocked in the calculator. This check runs on deployments/CI, not on a background schedule.
