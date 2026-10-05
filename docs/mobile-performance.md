# Mobile loading regression check

Run `npm run test:performance` after installing Chromium with `npx playwright install chromium`. The command builds with isolated Supabase fixture settings, then tests gzip-served production assets on localhost. It does not contact the production database or change production users. Do not deploy the fixture build; rebuild normally for deployment.

Each route runs three times in fresh Pixel 7 browser contexts with the HTTP cache disabled, 4× CPU slowdown, 1.6 Mbps download, 750 Kbps upload and 150 ms network latency. One worker avoids competing browser tests. Login is logged out; dashboard and rota use the owner fixture. External analytics is blocked. API responses are fixtures and are not a benchmark of Supabase or email delivery.

| Route | Initial gzip JS | Median ready time | Median sampled LCP |
| --- | --- | --- | --- |
| Login | 145 KiB | 5 seconds | 4.5 seconds |
| Dashboard | 195 KiB | 6.5 seconds | 5.5 seconds |
| Rota | 230 KiB | 7.5 seconds | 6.5 seconds |

Ready means the heading and primary control are visible, and signed-in data skeletons have disappeared. LCP is sampled 500 ms after readiness. This is a repeatable lab regression gate, not field Core Web Vitals or a claim that these upper budgets are performance targets. Timing allows CI hardware variance; gzip JS budgets are deterministic and deliberately tighter. The maximum JS across samples counts every requested local built JavaScript asset once, including preloads, compressed individually with Node gzip. API/analytics payloads are excluded.

GitHub deployment checks run this after the normal browser suite. Failures stop the checks. JSON results and per-route samples are uploaded as `mobile-performance-results` for 14 days; traces are retained on failure. To investigate, compare requested assets, per-run timings and the trace before raising a budget. Review thresholds after initial CI runs if runner variance warrants it; never increase them automatically to accommodate a regression.
