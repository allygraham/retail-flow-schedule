-- =====================================================
-- LAVORO — Retail Workforce Scheduling Schema
-- =====================================================

-- Enums
CREATE TYPE public.app_role AS ENUM ('owner', 'manager', 'employee');
CREATE TYPE public.schedule_status AS ENUM ('draft', 'published');
CREATE TYPE public.shift_status AS ENUM ('scheduled', 'unassigned', 'cancelled');
CREATE TYPE public.leave_type AS ENUM ('annual', 'unpaid', 'sick', 'other');
CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE public.employment_type AS ENUM ('full_time', 'part_time', 'casual', 'contractor');

-- Generic timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =====================================================
-- Core tenancy tables
-- =====================================================
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  industry TEXT DEFAULT 'retail',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, business_id)
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, business_id, role)
);

-- =====================================================
-- Security definer helpers (avoid RLS recursion)
-- =====================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _business_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND business_id = _business_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_member(_user_id UUID, _business_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = _user_id AND business_id = _business_id AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_owner(_user_id UUID, _business_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND business_id = _business_id
      AND role IN ('owner', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_id FROM public.memberships
  WHERE user_id = auth.uid() AND is_active = true
  ORDER BY created_at ASC LIMIT 1;
$$;

-- =====================================================
-- Retail tables
-- =====================================================
CREATE TABLE public.store_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  postcode TEXT,
  timezone TEXT DEFAULT 'Europe/London',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.roles_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id, name)
);

CREATE TABLE public.employee_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  primary_store_id UUID REFERENCES public.store_locations(id) ON DELETE SET NULL,
  primary_role_id UUID REFERENCES public.roles_catalog(id) ON DELETE SET NULL,
  employment_type public.employment_type DEFAULT 'part_time',
  contracted_hours NUMERIC(5,2),
  hire_date DATE,
  hourly_rate NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, business_id)
);

CREATE TABLE public.employee_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_profile_id UUID NOT NULL REFERENCES public.employee_profiles(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.store_locations(id) ON DELETE CASCADE,
  UNIQUE(employee_profile_id, store_id)
);

CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.store_locations(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  status public.schedule_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES public.schedules(id) ON DELETE SET NULL,
  store_id UUID NOT NULL REFERENCES public.store_locations(id) ON DELETE CASCADE,
  role_id UUID REFERENCES public.roles_catalog(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INT DEFAULT 0,
  status public.shift_status NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shifts_business_date ON public.shifts(business_id, shift_date);
CREATE INDEX idx_shifts_user ON public.shifts(assigned_user_id, shift_date);
CREATE INDEX idx_shifts_store_date ON public.shifts(store_id, shift_date);

CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_type public.leave_type NOT NULL DEFAULT 'annual',
  status public.leave_status NOT NULL DEFAULT 'pending',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leave_business_dates ON public.leave_requests(business_id, start_date, end_date);

CREATE TABLE public.availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week INT,
  unavailable_date DATE,
  start_time TIME,
  end_time TIME,
  is_recurring BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- updated_at triggers
-- =====================================================
CREATE TRIGGER trg_businesses_updated BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_stores_updated BEFORE UPDATE ON public.store_locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_emp_profiles_updated BEFORE UPDATE ON public.employee_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_schedules_updated BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_shifts_updated BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_leave_updated BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Profile auto-creation trigger
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- Enable RLS
-- =====================================================
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- businesses: members can read; only owners can update; anyone authenticated can insert (signup creates one)
CREATE POLICY "Members read their businesses" ON public.businesses
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), id));
CREATE POLICY "Authenticated can create business" ON public.businesses
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Owners update business" ON public.businesses
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), id, 'owner'));

-- profiles: read your own; members of same business can read each other's profiles
CREATE POLICY "Read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Read profiles of co-members" ON public.profiles
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.memberships m1
      JOIN public.memberships m2 ON m1.business_id = m2.business_id
      WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.id
    )
  );
CREATE POLICY "Update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- memberships
CREATE POLICY "Read own memberships" ON public.memberships
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_manager_or_owner(auth.uid(), business_id));
CREATE POLICY "Owners insert memberships" ON public.memberships
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() OR public.has_role(auth.uid(), business_id, 'owner')
  );
CREATE POLICY "Managers update memberships" ON public.memberships
  FOR UPDATE TO authenticated USING (public.is_manager_or_owner(auth.uid(), business_id));
CREATE POLICY "Owners delete memberships" ON public.memberships
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), business_id, 'owner'));

-- user_roles
CREATE POLICY "Read roles in your businesses" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), business_id));
CREATE POLICY "Owners or self-bootstrap insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() OR public.has_role(auth.uid(), business_id, 'owner')
  );
CREATE POLICY "Owners update roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), business_id, 'owner'));
CREATE POLICY "Owners delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), business_id, 'owner'));

-- store_locations
CREATE POLICY "Members read stores" ON public.store_locations
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), business_id));
CREATE POLICY "Managers manage stores" ON public.store_locations
  FOR ALL TO authenticated USING (public.is_manager_or_owner(auth.uid(), business_id))
  WITH CHECK (public.is_manager_or_owner(auth.uid(), business_id));

-- roles_catalog
CREATE POLICY "Members read roles_catalog" ON public.roles_catalog
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), business_id));
CREATE POLICY "Managers manage roles_catalog" ON public.roles_catalog
  FOR ALL TO authenticated USING (public.is_manager_or_owner(auth.uid(), business_id))
  WITH CHECK (public.is_manager_or_owner(auth.uid(), business_id));

-- employee_profiles
CREATE POLICY "Members read employee_profiles" ON public.employee_profiles
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), business_id));
CREATE POLICY "Managers manage employee_profiles" ON public.employee_profiles
  FOR ALL TO authenticated USING (public.is_manager_or_owner(auth.uid(), business_id))
  WITH CHECK (public.is_manager_or_owner(auth.uid(), business_id));
CREATE POLICY "Employees update own employee_profile" ON public.employee_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- employee_stores
CREATE POLICY "Members read employee_stores" ON public.employee_stores
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.employee_profiles ep
            WHERE ep.id = employee_profile_id AND public.is_member(auth.uid(), ep.business_id))
  );
CREATE POLICY "Managers manage employee_stores" ON public.employee_stores
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.employee_profiles ep
            WHERE ep.id = employee_profile_id AND public.is_manager_or_owner(auth.uid(), ep.business_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.employee_profiles ep
            WHERE ep.id = employee_profile_id AND public.is_manager_or_owner(auth.uid(), ep.business_id))
  );

-- schedules
CREATE POLICY "Members read schedules" ON public.schedules
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), business_id));
CREATE POLICY "Managers manage schedules" ON public.schedules
  FOR ALL TO authenticated USING (public.is_manager_or_owner(auth.uid(), business_id))
  WITH CHECK (public.is_manager_or_owner(auth.uid(), business_id));

-- shifts
CREATE POLICY "Members read shifts" ON public.shifts
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), business_id));
CREATE POLICY "Managers manage shifts" ON public.shifts
  FOR ALL TO authenticated USING (public.is_manager_or_owner(auth.uid(), business_id))
  WITH CHECK (public.is_manager_or_owner(auth.uid(), business_id));

-- leave_requests
CREATE POLICY "Members read leave" ON public.leave_requests
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), business_id));
CREATE POLICY "Employees create own leave" ON public.leave_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_member(auth.uid(), business_id));
CREATE POLICY "Owners cancel own leave" ON public.leave_requests
  FOR UPDATE TO authenticated USING (
    user_id = auth.uid() OR public.is_manager_or_owner(auth.uid(), business_id)
  );
CREATE POLICY "Managers delete leave" ON public.leave_requests
  FOR DELETE TO authenticated USING (public.is_manager_or_owner(auth.uid(), business_id));

-- availability
CREATE POLICY "Members read availability" ON public.availability
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), business_id));
CREATE POLICY "Users manage own availability" ON public.availability
  FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_manager_or_owner(auth.uid(), business_id))
  WITH CHECK (user_id = auth.uid() OR public.is_manager_or_owner(auth.uid(), business_id));

-- audit_log
CREATE POLICY "Managers read audit" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_manager_or_owner(auth.uid(), business_id));
CREATE POLICY "Members insert audit entries" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid(), business_id));
