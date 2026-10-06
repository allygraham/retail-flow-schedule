-- Do not let stale role lists or direct API deletes erase assignments.
-- NO ACTION checks all references atomically while allowing whole-business cascades.
ALTER TABLE public.employee_profiles DROP CONSTRAINT IF EXISTS employee_profiles_primary_role_id_fkey;
ALTER TABLE public.employee_profiles ADD CONSTRAINT employee_profiles_primary_role_id_fkey
  FOREIGN KEY (primary_role_id) REFERENCES public.roles_catalog(id) ON DELETE NO ACTION;
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_role_id_fkey;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES public.roles_catalog(id) ON DELETE NO ACTION;
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_primary_role_id_fkey;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_primary_role_id_fkey
  FOREIGN KEY (primary_role_id) REFERENCES public.roles_catalog(id) ON DELETE NO ACTION;
