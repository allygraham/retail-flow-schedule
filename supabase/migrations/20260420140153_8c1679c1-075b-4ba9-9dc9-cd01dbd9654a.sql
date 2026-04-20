CREATE TABLE public.custom_holidays (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text NOT NULL,
  blocks_scheduling boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, date)
);

CREATE INDEX idx_custom_holidays_business_date ON public.custom_holidays(business_id, date);

ALTER TABLE public.custom_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read custom holidays"
  ON public.custom_holidays FOR SELECT
  TO authenticated
  USING (public.is_member(auth.uid(), business_id));

CREATE POLICY "Managers insert custom holidays"
  ON public.custom_holidays FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager_or_owner(auth.uid(), business_id));

CREATE POLICY "Managers update custom holidays"
  ON public.custom_holidays FOR UPDATE
  TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), business_id))
  WITH CHECK (public.is_manager_or_owner(auth.uid(), business_id));

CREATE POLICY "Managers delete custom holidays"
  ON public.custom_holidays FOR DELETE
  TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), business_id));

CREATE TRIGGER custom_holidays_set_updated_at
  BEFORE UPDATE ON public.custom_holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();