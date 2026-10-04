Run `npx playwright install chromium` once, then `npm run test:e2e`.

These tests run the actual React app in Chromium against isolated, stateful Supabase API fixtures. They cover signup confirmation, invitation acceptance after login, manager leave approval, shift assignment/publication, holiday/notification failure recovery, password recovery/logout failures, invitation creation/renewal/revocation, employee access changes, and atomic role/employment edits. No production accounts, invitations, shifts or emails are created.

The API fixtures verify frontend requests and behaviour; they do not validate a running Supabase Auth service or Postgres. `npm run test:db` separately checks permissions and transaction behaviour against PGlite. A staging Supabase integration suite would be needed to validate email delivery and the complete deployed backend together.

GitHub Actions runs the browser suite after the deployment checks and retains failure traces for seven days. Vercel runs the existing deployment checks without downloading a browser.
