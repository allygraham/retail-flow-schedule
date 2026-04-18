

# Lavoro — Retail Workforce Scheduling SaaS

Same plan as approved, with the product renamed from **ShelfShift** to **Lavoro** throughout. Tagline direction: "Lavoro — rotas that run themselves." Demo business stays as "Northshore Outfitters" (a tenant inside Lavoro).

Everything else from the previously approved plan stands:

- **Stack:** React + Vite + TypeScript, **CSS Modules / SCSS Modules** for all custom UI, shadcn primitives kept for a11y, Lovable Cloud (Postgres + Auth + RLS) for multi-tenancy.
- **Phase 1 scope (this build):** marketing site (Landing, Features, Pricing), auth (signup creates business + owner, login, forgot/reset), three role-aware dashboards, weekly rota with create/edit/filter/conflict warnings + draft vs published, leave requests, team management, store locations, employee profile + personal shift list, settings, seeded demo data with owner/manager/employee accounts.
- **Phase 2:** drag-and-drop, copy previous week, monthly calendar, recurring patterns, coverage heatmap, audit log UI.
- **Phase 3:** real invites, notifications, availability calendar, reporting/payroll/billing stubs.
- **Security:** RLS on every tenant table, `has_role()` + `current_business_id()` security-definer helpers, roles in a separate `user_roles` table, Zod validation on all forms/mutations, protected route wrapper.
- **Folder structure:** App-Router-style route groups under `src/app/` — `(marketing)`, `(auth)`, `(app)` — with `components/`, `features/`, `lib/`, `styles/` (tokens + mixins), `types/`.

Branding touches applied during build:
- Wordmark "Lavoro" with a simple geometric mark (stacked bars suggesting a rota grid)
- Page title, OG tags, README, footer, auth screens, and seeded copy all use "Lavoro"
- Accent palette tuned to a confident indigo with a warm secondary, paired with deep slate surfaces

