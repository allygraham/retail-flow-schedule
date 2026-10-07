-- Persist publication by store/week, including weeks with no shifts remaining.
CREATE TABLE public.rota_week_publications (
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 store_id uuid NOT NULL REFERENCES public.store_locations(id) ON DELETE CASCADE,
 week_start date NOT NULL,
 PRIMARY KEY (business_id,store_id,week_start)
);
ALTER TABLE public.rota_week_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rota_week_publications FROM PUBLIC,anon,authenticated;
INSERT INTO public.rota_week_publications
 SELECT DISTINCT business_id,store_id,date_trunc('week',shift_date::timestamp)::date
 FROM public.shifts WHERE is_published AND status<>'cancelled';
CREATE FUNCTION public.record_rota_week_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.is_published AND NEW.status<>'cancelled' THEN
  INSERT INTO public.rota_week_publications VALUES(NEW.business_id,NEW.store_id,date_trunc('week',NEW.shift_date::timestamp)::date) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_rota_week_publication() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER record_rota_week_publication AFTER INSERT OR UPDATE ON public.shifts
 FOR EACH ROW EXECUTE FUNCTION public.record_rota_week_publication();
CREATE FUNCTION public.get_rota_week_status(_business_id uuid,_week_start date)
RETURNS TABLE(store_id uuid,is_published boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_member(auth.uid(),_business_id) THEN RAISE EXCEPTION 'Active membership required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT st.id,
  EXISTS(SELECT 1 FROM public.rota_week_publications p WHERE p.business_id=_business_id AND p.store_id=st.id AND p.week_start=_week_start)
  AND NOT EXISTS(SELECT 1 FROM public.shifts sh WHERE sh.business_id=_business_id AND sh.store_id=st.id AND sh.shift_date BETWEEN _week_start AND _week_start+6 AND NOT sh.is_published AND sh.status<>'cancelled')
 FROM public.store_locations st WHERE st.business_id=_business_id AND st.is_active;
END $$;
REVOKE ALL ON FUNCTION public.get_rota_week_status(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_rota_week_status(uuid,date) TO authenticated;
