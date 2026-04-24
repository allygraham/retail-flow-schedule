-- =============================================================================
-- DEMO SEED DATA
-- =============================================================================
-- This seed populates a fresh database with realistic demo data so you can
-- explore the app immediately after running migrations.
--
-- HOW TO RUN
-- ----------
-- 1. Apply migrations (creates schema, RLS, functions, triggers):
--      npx supabase db push
--
-- 2. Apply this seed:
--      npx supabase db execute --file supabase/seed.sql
--
--    Or, for a clean local reset (requires Docker):
--      npx supabase db reset
--
-- IMPORTANT
-- ---------
-- * We do NOT insert into auth.users here. Real users must sign up through
--   the app (Supabase Auth). This seed creates business data only.
-- * memberships, user_roles and employee_profiles rows reference user IDs
--   from auth.users. After you sign up your first user, run the snippet at
--   the bottom of this file (commented out) to link that user as the owner
--   of the demo business.
-- * All `INSERT`s use `ON CONFLICT DO NOTHING` so this file is idempotent.
-- * Insertion order: businesses -> stores -> roles_catalog -> branding ->
--   (auth users via app) -> memberships -> user_roles -> employee_profiles
--   -> leave_requests -> notifications -> invitations.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Business
-- -----------------------------------------------------------------------------
insert into public.businesses (id, name, slug, industry, public_holidays_enabled, public_holidays_region)
values
  ('11111111-1111-1111-1111-111111111111', 'Top Drawer Retail', 'top-drawer-retail', 'retail', true, 'england')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Store locations
-- -----------------------------------------------------------------------------
insert into public.store_locations (id, business_id, name, address, city, postcode, timezone, is_active)
values
  ('22222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Camden Flagship', '12 Camden High St', 'London', 'NW1 0JH', 'Europe/London', true),
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Soho Store',     '48 Old Compton St', 'London', 'W1D 4UD', 'Europe/London', true),
  ('22222222-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Shoreditch Pop-up', '101 Brick Lane', 'London', 'E1 6SE', 'Europe/London', true)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Roles catalog (job roles, not auth roles)
-- -----------------------------------------------------------------------------
insert into public.roles_catalog (id, business_id, name, color)
values
  ('33333333-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sales Assistant', '#5B5FEF'),
  ('33333333-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Floor Manager',   '#16A34A'),
  ('33333333-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Visual Merchandiser', '#F97316'),
  ('33333333-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Stockroom',       '#475569')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Branding (default theme)
-- -----------------------------------------------------------------------------
insert into public.business_branding (business_id, theme_key, display_name)
values
  ('11111111-1111-1111-1111-111111111111', 'default', 'Top Drawer Retail')
on conflict (business_id) do nothing;

-- -----------------------------------------------------------------------------
-- Pending invitations (manager/owner can send these from the Team page)
-- -----------------------------------------------------------------------------
-- These are open invites that will be picked up automatically when someone
-- signs up using the matching email (via the accept_invitation RPC).
insert into public.invitations (
  id, business_id, email, full_name, role,
  primary_store_id, primary_role_id, contracted_hours, hire_date,
  token, status, expires_at
)
values
  ('44444444-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'maya.demo@example.com', 'Maya Patel', 'employee',
   '22222222-0000-0000-0000-000000000001',
   '33333333-0000-0000-0000-000000000001',
   32, current_date - interval '180 days',
   'demo-invite-token-maya-please-replace-in-production-0001',
   'pending', now() + interval '14 days'),
  ('44444444-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'jake.demo@example.com', 'Jake Turner', 'employee',
   '22222222-0000-0000-0000-000000000002',
   '33333333-0000-0000-0000-000000000004',
   24, current_date - interval '90 days',
   'demo-invite-token-jake-please-replace-in-production-0002',
   'pending', now() + interval '14 days')
on conflict (id) do nothing;

-- =============================================================================
-- LINKING REAL AUTH USERS TO THE DEMO BUSINESS
-- =============================================================================
-- After signing up your first user through the app, run the following block
-- (uncomment + replace USER_ID) to make that user the OWNER of the demo
-- business. From then on, the app will show the seeded stores/roles.
--
--   DO $$
--   DECLARE
--     v_user uuid := 'PASTE-AUTH-USER-ID-HERE';
--     v_biz  uuid := '11111111-1111-1111-1111-111111111111';
--   BEGIN
--     INSERT INTO public.memberships (user_id, business_id, is_active)
--     VALUES (v_user, v_biz, true) ON CONFLICT DO NOTHING;
--
--     INSERT INTO public.user_roles (user_id, business_id, role)
--     VALUES (v_user, v_biz, 'owner') ON CONFLICT DO NOTHING;
--
--     INSERT INTO public.employee_profiles (
--       user_id, business_id, primary_store_id, primary_role_id,
--       employment_type, contracted_hours, hire_date
--     ) VALUES (
--       v_user, v_biz,
--       '22222222-0000-0000-0000-000000000001',
--       '33333333-0000-0000-0000-000000000002',
--       'full_time', 40, current_date - interval '365 days'
--     ) ON CONFLICT (user_id, business_id) DO NOTHING;
--   END $$;
-- =============================================================================
