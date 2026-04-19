# Lavoro — Architecture Reference

> Practical, production-oriented spec reflecting **what is actually built today**.
> Stack: React 18 + Vite 5 + TypeScript, SCSS Modules, react-router-dom v6, TanStack Query, Supabase (Lovable Cloud) for auth + Postgres + RLS.

---

## 1. Data Model

All tables live in `public` and are tenant-scoped by `business_id`. Roles are stored in a **dedicated `user_roles` table** (never on `profiles`) to prevent privilege-escalation. There are no DB-level FKs between tenant tables and `auth.users`; user references are plain `uuid` columns guarded by RLS.

### 1.1 Tables grouped by concern

**Tenancy & identity**
| Table | Purpose | Key columns |
|---|---|---|
| `businesses` | Tenant root | `id`, `name`, `slug`, `industry` |
| `memberships` | Which users belong to which business | `user_id`, `business_id`, `is_active` |
| `user_roles` | Role per user per business (`owner` \| `manager` \| `employee`) | `user_id`, `business_id`, `role` |
| `profiles` | Per-user public profile (1:1 with `auth.users.id`) | `id`, `full_name`, `phone`, `avatar_url` |

**Org structure**
| Table | Purpose |
|---|---|
| `store_locations` | Physical stores within a business (`timezone`, address, `is_active`) |
| `roles_catalog` | Job roles (e.g. "Sales Associate", "Keyholder") with display `color` |
| `employee_profiles` | HR data: `employment_type`, `contracted_hours`, `hourly_rate`, `primary_store_id`, `primary_role_id` |
| `employee_stores` | M:N — which stores an employee can also work at |

**Scheduling**
| Table | Purpose |
|---|---|
| `schedules` | One row per (`store_id`, `week_start`); `status` ∈ `draft` \| `published` |
| `shifts` | Individual shift rows; optional `schedule_id`, required `store_id`, optional `assigned_user_id`/`role_id`. `is_published` mirrors parent schedule. `status` ∈ `scheduled` \| `unassigned` \| `cancelled`. |

**Time off & availability**
| Table | Purpose |
|---|---|
| `leave_requests` | `leave_type` ∈ `annual` \| `unpaid` \| `sick` \| `other`; `status` ∈ `pending` \| `approved` \| `rejected` \| `cancelled`; `reviewed_by`/`reviewed_at` |
| `availability` | Either recurring (`day_of_week` + times) or one-off (`unavailable_date`) |

**Audit**
| Table | Purpose |
|---|---|
| `audit_log` | Append-only (`entity_type`, `entity_id`, `action`, `metadata`, `actor_id`) |

### 1.2 Relationships (ASCII ERD)

```
                    auth.users (Supabase-managed)
                         │ 1:1
                         ▼
                     profiles
                         │
                         │   memberships (M:N user↔business)        user_roles (role per user per business)
                         └──────────┬──────────────────────────────────────┐
                                    ▼                                      ▼
                               businesses ◄───────────────────────────────┘
                                    │
        ┌────────────────┬──────────┼─────────────────┬──────────────┬──────────────┐
        ▼                ▼          ▼                 ▼              ▼              ▼
 store_locations   roles_catalog  schedules     leave_requests   availability   audit_log
        │                │          │
        │                │          │ 1:N
        │                │          ▼
        │                │       shifts ───► assigned_user_id (auth.users)
        │                └──────►  shifts.role_id
        └───────────────────────►  shifts.store_id

 employee_profiles ──► primary_store_id, primary_role_id
        │
        │ 1:N
        ▼
 employee_stores ──► store_locations  (M:N coverage)
```

### 1.3 Security-definer helpers (used in every RLS policy)

| Function | Purpose |
|---|---|
| `is_member(_business_id, _user_id)` | True if active membership exists |
| `is_manager_or_owner(_business_id, _user_id)` | True if `user_roles.role` ∈ {`owner`,`manager`} for that business |
| `has_role(_business_id, _role, _user_id)` | Exact role check |
| `current_business_id()` | Resolves caller's primary business for default scoping |
| `bootstrap_business(_name, _slug)` RPC | Atomically creates a business + owner membership + owner role on signup |

These are `SECURITY DEFINER` to avoid recursive RLS evaluation.

---

## 2. Role Permissions

Three roles, all enforced in Postgres via RLS — the client cannot bypass them.

| Resource | Owner | Manager | Employee |
|---|---|---|---|
| `businesses` (own row) | read, update | read | read |
| `memberships` | full | update (activate/deactivate) | read self |
| `user_roles` | full | read | read |
| `store_locations` | full | full | read |
| `roles_catalog` | full | full | read |
| `employee_profiles` | full | full | read all, update self |
| `employee_stores` | full | full | read |
| `schedules` | full | full | read |
| `shifts` | full | full | read |
| `leave_requests` | full | read all, approve/reject, delete | read all, create own, cancel own |
| `availability` | full | full | read all, manage own |
| `audit_log` | read, insert | read, insert | insert (own actions) |

Client-side, `ProtectedRoute roles={['owner','manager']}` gates `/team`, `/stores`, `/settings`. Everything else relies on RLS as the source of truth.

---

## 3. Key User Flows

### 3.1 Sign up → tenant bootstrap
1. User signs up via `/signup` (email + password, `emailRedirectTo: window.location.origin`).
2. After confirmation, app calls `bootstrap_business(name, slug)` RPC.
3. RPC inserts: `businesses`, `memberships(is_active=true)`, `user_roles(role='owner')`, plus a default `store_locations` row and seed `roles_catalog` entries.
4. `AuthProvider.loadTenancy()` re-resolves: `profiles.full_name`, primary `memberships.businesses`, then `user_roles.role` for that business.
5. Redirect to `/dashboard`.

Existing users invited to a business get a `memberships` row + `user_roles` row inserted by an owner; they pick that business via the same `loadTenancy` path.

### 3.2 Create a shift (manager)
1. Manager opens `/rota`, selects a week and store filter.
2. Clicks empty grid cell → `ShiftModal` opens with date+employee prefilled.
3. Form (Zod-validated): `role_id`, `start_time`, `end_time`, `break_minutes`, `notes`.
4. Optional: `schedules` row for `(store_id, week_start)` is upserted (`status='draft'`) so the shift can FK into it.
5. Insert into `shifts` with `business_id`, `store_id`, `status='scheduled'`, `is_published=false`, `created_by=auth.uid()`.
6. Conflict checks happen client-side before insert: overlapping shift for same `assigned_user_id`, or overlap with an `approved` `leave_requests` row.
7. `audit_log` insert: `entity_type='shift'`, `action='create'`.

### 3.3 Publish a week
1. Manager clicks **Publish** in `RotaToolbar`.
2. Update `schedules.status='published'`, `published_at=now()`.
3. Bulk update child `shifts.is_published=true`.
4. `audit_log` entry per published schedule.
5. Employees now see the shifts on `/dashboard` and `/profile`. Unpublishing reverses both flags and is also audited.

### 3.4 Request leave (employee)
1. Employee opens `/leave` → "New request".
2. Form: `leave_type`, `start_date`, `end_date`, `reason`. Validation: end ≥ start, no past dates, no overlap with another pending/approved request.
3. Insert `leave_requests` with `status='pending'`, `user_id=auth.uid()`.
4. List refetches via TanStack Query.

### 3.5 Approve / reject leave (manager)
1. Manager opens `/leave` → sees all pending requests for the business.
2. Clicks Approve or Reject → optional `review_notes`.
3. Update `status`, `reviewed_by=auth.uid()`, `reviewed_at=now()`.
4. If approved, the rota's conflict check will warn on any overlapping shifts on subsequent edits.
5. `audit_log` entry: `entity_type='leave_request'`, `action='approve'|'reject'`.

---

## 4. Page Structure & Routing

This project uses **react-router-dom v6**. The `src/app/(marketing|auth|app)/` folder convention is borrowed from Next.js App Router for **organization only** — there is no Next.js runtime, no nested layout files, and no server components.

### 4.1 Route table (from `src/App.tsx`)

| Path | Component | Guard |
|---|---|---|
| `/` | `Landing` | public |
| `/features` | `Features` | public |
| `/pricing` | `Pricing` | public |
| `/login` | `Login` | public |
| `/signup` | `Signup` | public |
| `/forgot-password` | `ForgotPassword` | public |
| `/reset-password` | `ResetPassword` | public |
| `/dashboard` | `Dashboard` | `ProtectedRoute` → `AppShell` |
| `/rota` | `Rota` | `ProtectedRoute` → `AppShell` |
| `/leave` | `Leave` | `ProtectedRoute` → `AppShell` |
| `/profile` | `Profile` | `ProtectedRoute` → `AppShell` |
| `/team` | `Team` | `ProtectedRoute roles={['owner','manager']}` → `AppShell` |
| `/stores` | `Stores` | `ProtectedRoute roles={['owner','manager']}` → `AppShell` |
| `/settings` | `Settings` | `ProtectedRoute roles={['owner','manager']}` → `AppShell` |
| `*` | `NotFound` | — |

### 4.2 Folder layout (actual)

```
src/
├── app/
│   ├── (marketing)/   Landing, Features, Pricing
│   ├── (auth)/        Login, Signup, ForgotPassword, ResetPassword
│   └── (app)/         AppShell + Dashboard, Rota, Leave, Team, Stores, Profile, Settings
├── components/
│   ├── common/        Button, Card, Field, Modal, Avatar, Badge, Stat, EmptyState, Logo
│   ├── ui/            shadcn primitives (kept for Toaster/Tooltip)
│   └── NavLink.tsx
├── features/
│   └── auth/          AuthProvider, ProtectedRoute
├── integrations/supabase/   client.ts (auto-generated), types.ts (auto-generated)
├── lib/               datetime.ts, validation.ts, utils.ts
├── styles/            _tokens.scss, _mixins.scss, globals.scss
└── types/             domain.ts
```

### 4.3 Auth shell

`AuthProvider` (in `src/features/auth/AuthProvider.tsx`):
1. Subscribes to `supabase.auth.onAuthStateChange` **first**, then calls `getSession()` (prevents missed events).
2. On a session, defers tenancy load via `setTimeout(0)` to avoid blocking the auth callback.
3. Loads `profiles.full_name`, oldest active `memberships.businesses`, then `user_roles.role` for that business.
4. Exposes `{ loading, session, user, fullName, business, role, signOut, refresh }`.

`ProtectedRoute`: shows spinner while loading, redirects to `/login` if no user, redirects to `/dashboard` if role doesn't match `roles` prop.

---

## 5. Rota Builder Component Architecture

**Current implementation (`src/app/(app)/Rota.tsx`) is monolithic** — week state, fetching, grid render, and modal all live in one file. The intended decomposition (and the shape future edits should move toward) is:

```
Rota (page)
├── state: weekStart, storeFilter, selectedShift
├── data: useShifts(weekStart, storeId)
│         useEmployees(businessId, storeId)
│         useLeaveOverlap(weekStart)
│
├── RotaToolbar
│     ├── WeekNavigator (prev / today / next, week-of label)
│     ├── StoreFilter (Select; "All stores" aggregates)
│     ├── ViewToggle (week / day — day view is future work)
│     └── PublishButton (visible to manager+; dispatches publish flow)
│
├── RotaGrid
│     ├── header row: 7 days (date + weekday)
│     ├── rows: one per employee in scope (+ "Unassigned" row)
│     └── ShiftCell × 7
│           ├── empty → click to create
│           └── filled → ShiftChip (role color, time, hours total)
│                       click to edit
│
└── ShiftModal
      ├── Field-based form (Zod schema in lib/validation.ts)
      ├── inline conflict warnings (overlap / approved leave)
      └── actions: Save · Delete · Cancel
```

Key conventions:
- All data fetching is via TanStack Query keys: `['shifts', businessId, weekStart, storeId]`, `['employees', businessId]`, `['roles', businessId]`.
- Mutations invalidate the matching query keys; optimistic updates only on drag-move (future).
- Times stored as Postgres `time without time zone` + `date` — combined client-side using each store's `timezone` (default `Europe/London`).

---

## 6. Multi-Store Support

- **Every tenant table carries `business_id`.** Store-scoped tables also carry `store_id`.
- **Employees**: have one `primary_store_id` on `employee_profiles`, plus an M:N `employee_stores` table for cross-store coverage. The "who can I assign?" query is:

  ```sql
  -- Employees who can work at a given store
  SELECT ep.* FROM employee_profiles ep
  WHERE ep.business_id = :business_id
    AND (ep.primary_store_id = :store_id
         OR EXISTS (SELECT 1 FROM employee_stores es
                    WHERE es.employee_profile_id = ep.id
                      AND es.store_id = :store_id));
  ```

- **Rota filtering**: the store dropdown in `RotaToolbar` filters `shifts` by `store_id`. "All stores" omits the filter and groups visually by store header in the grid.
- **Schedules**: keyed on `(store_id, week_start)`. A `schedules` row with `store_id IS NULL` represents a business-wide week (rare, used for holiday-style overrides).
- **Timezones**: each `store_locations.timezone` is the source of truth for display; the rota grid renders shifts in their store's local time, regardless of viewer location.

---

## 7. Draft vs Published Schedules

Two flags in tandem:

| Layer | Field | Values |
|---|---|---|
| `schedules` | `status` | `draft` (default) → `published` |
| `schedules` | `published_at` | `null` → timestamp on publish |
| `shifts` | `is_published` | `false` (default) → `true` when parent schedule publishes |

### Visibility rules (enforced in queries, not RLS)

- **Managers/owners** see all shifts regardless of `is_published`.
- **Employees** only see shifts where `is_published = true`. Implemented as a query predicate (`.eq('is_published', true)`) on the Dashboard and Profile pages — RLS allows reads, but the UI filters draft noise.

### Lifecycle

1. **Draft** — managers edit freely. Mutations bump `schedules.updated_at`. No employee notification.
2. **Publish** — `schedules.status='published'`, `published_at=now()`, bulk `UPDATE shifts SET is_published=true WHERE schedule_id=$1`. Single `audit_log` entry per schedule.
3. **Edit after publish** — allowed. `shifts.updated_at` is bumped; an `audit_log` entry with `action='update_published'` is appended so changes are traceable.
4. **Unpublish** — sets `schedules.status='draft'`, nulls `published_at`, bulk-flips `shifts.is_published=false`. Logged. Used sparingly.
5. **Republish** — idempotent: re-runs step 2.

### Why both flags?
`schedules.status` is the manager-facing concept ("is this week live?"). `shifts.is_published` is denormalised onto each shift so employee-facing queries don't need a join, and so individual shifts can theoretically be hidden without unpublishing the whole week (future feature).

---

## Appendix — Conventions

- **Styling**: SCSS Modules + design tokens in `src/styles/_tokens.scss`. No raw color literals in components; use HSL custom properties from `index.css`.
- **Validation**: Zod schemas in `src/lib/validation.ts`, surfaced via the shared `Field` component.
- **Datetime**: helpers in `src/lib/datetime.ts` (`startOfWeek`, `formatRange`, `combineDateTime`).
- **Types**: `src/types/domain.ts` re-exports DB row types from `src/integrations/supabase/types.ts` and adds app-level unions like `AppRole`.
- **Never edit**: `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, `supabase/migrations/*`.
