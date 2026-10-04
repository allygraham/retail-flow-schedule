# Lavoro

Use Node.js 24 and npm (`nvm use`, then `npm ci`). Run `npm run dev` for local development.

## Deployment checks

`npm run check:deploy` runs the dependency security audit, lint (zero warnings), frontend tests, all isolated database regression suites,
strict application and build/test-configuration type checking, and the production build. Database
tests use PGlite and never connect to the production database.

GitHub runs these checks on pull requests and pushes to main. Vercel uses the same
command as its build command, so a failing check stops deployment. Vercel installs
from `package-lock.json` with `npm ci`; configure the production Supabase environment
variables in Vercel. The GitHub validation build uses dummy Supabase values.

`npm audit` reports dependency advisories. CI blocks new advisories at every severity, with one explicit exception. Remaining
unpatched build-tool advisories are documented in `DEPENDENCY_SECURITY.md`.

TypeScript strict mode includes implicit-any, null, unused-variable and switch fall-through checks.
Shared hooks and style helpers live outside component modules to support Fast Refresh.
