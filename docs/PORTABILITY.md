# Portability guide — running this app on your own Supabase + Netlify

This project is a standard Vite + React app backed by Supabase. Everything
needed to run it independently of Lovable lives in this repo:

```
supabase/
  migrations/   ← schema, RLS, functions, triggers (source of truth)
  seed.sql      ← demo data (idempotent, safe to re-run)
  functions/
    invite-employee/   ← edge function that creates invites
src/
  integrations/supabase/client.ts   ← reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
```

---

## 1. Create your Supabase project

1. Create a new project at https://supabase.com.
2. Grab from **Project Settings → API**:
   - `Project URL`           → `VITE_SUPABASE_URL`
   - `anon public` key       → `VITE_SUPABASE_PUBLISHABLE_KEY` (also kept as `VITE_SUPABASE_ANON_KEY` for legacy code)
   - `service_role` key      → backend only — **never** ship to the frontend.
3. Note your project ref (the subdomain) → `VITE_SUPABASE_PROJECT_ID`.

## 2. Install the Supabase CLI

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
```

## 3. Apply the schema

Migrations are the single source of truth.

```bash
npx supabase db push
```

This creates every table, enum, function, trigger, RLS policy, and storage
bucket the app needs. Run it any time you pull new migrations.

For a clean local reset (requires Docker):

```bash
npx supabase db reset
```

## 4. Seed demo data (optional)

```bash
npx supabase db execute --file supabase/seed.sql
```

The seed creates one demo business, three stores, a roles catalog, default
branding, and two pending invitations. It does **not** touch `auth.users` —
real users must sign up through the app. After your first signup, follow the
commented-out block at the bottom of `seed.sql` to promote that user to owner
of the demo business.

## 5. Deploy the edge function

```bash
npx supabase functions deploy invite-employee
```

The function uses `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` — these are injected automatically by Supabase.

## 6. Configure auth

In **Authentication → URL configuration**:

- **Site URL**: your Netlify URL (e.g. `https://your-app.netlify.app`)
- **Redirect URLs**: add the same URL plus `http://localhost:5173` for local
  dev. Also add `…/accept-invite` and `…/reset-password` if you want deep
  links to survive auth redirects.

In **Authentication → Providers** enable **Email** and **Google** (the app
ships with both). For Google you'll need a Google OAuth client ID/secret.

## 7. Deploy to Netlify

1. Push the repo to GitHub.
2. New site → import from Git.
3. Build command: `npm run build`   Publish dir: `dist`
4. **Site settings → Environment variables** — add:

   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<your anon key>
   VITE_SUPABASE_ANON_KEY=<same anon key>
   VITE_SUPABASE_PROJECT_ID=<ref>
   ```

5. Add a `_redirects` file (or `netlify.toml`) so client-side routing works:

   ```
   /*   /index.html   200
   ```

---

## How the auth + invite flow works

- **Owner signup**: `Signup.tsx` calls `supabase.auth.signUp`, then
  `bootstrap_business(name, slug)` RPC which creates a business, a
  membership, and an `owner` row in `user_roles`.
- **Manager invites employee**: the Team page calls the `invite-employee`
  edge function, which validates the caller and inserts an `invitations`
  row with a unique token. An email or copyable link points the invitee to
  `/accept-invite?token=…`.
- **Invitee accepts**: `AcceptInvite.tsx` signs the user up (or in), then
  calls the `accept_invitation(token)` RPC which:
  - verifies the token is pending and the email matches,
  - inserts `memberships`, `user_roles`, `employee_profiles` rows,
  - upserts the `profiles` row,
  - marks the invitation `accepted`.

This linking guarantees no duplicate employee profile is created — the RPC
short-circuits if one already exists for the user+business pair (the
`employee_profiles_user_id_business_id_key` unique constraint enforces it).

## Multi-tenant safety

Every domain table has RLS enabled and is scoped by `business_id` through
three security-definer helpers:

- `is_member(_user_id, _business_id)`
- `is_manager_or_owner(_user_id, _business_id)`
- `has_permission(_user_id, _business_id, _permission)`

Employees can only read/update their own rows; managers can manage operational
data within their business; owners can change settings. Service-role key is
never used in the frontend.
