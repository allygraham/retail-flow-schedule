-- Private delivery receipts survive recipient deletion and prevent retry duplicates.
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  delivery_key text PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_deliveries FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_coverage_staff(_business_id uuid, _notifications jsonb)
RETURNS TABLE(sent_count integer, already_sent_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  recipient jsonb; recipient_id uuid; ids uuid[]; requested integer;
  fingerprint text; message text; inserted integer; sent integer := 0; existing integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m JOIN user_roles r USING (user_id,business_id)
    WHERE m.user_id=auth.uid() AND m.business_id=_business_id AND m.is_active AND r.role IN ('owner','manager')) THEN
    RAISE EXCEPTION 'Active management required' USING ERRCODE='42501';
  END IF;
  IF _notifications IS NULL OR jsonb_typeof(_notifications)<>'array' OR jsonb_array_length(_notifications)>500 THEN
    RAISE EXCEPTION 'Invalid notification recipients' USING ERRCODE='23514';
  END IF;
  -- Serialize delivery attempts within a workspace, including concurrent retries.
  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,51900));
  FOR recipient IN SELECT value FROM jsonb_array_elements(_notifications) LOOP
    recipient_id := (recipient->>'user_id')::uuid;
    IF recipient_id IS NULL OR NOT EXISTS (SELECT 1 FROM memberships
      WHERE user_id=recipient_id AND business_id=_business_id AND is_active) THEN
      RAISE EXCEPTION 'Recipient is not an active workspace member' USING ERRCODE='42501';
    END IF;
    IF jsonb_typeof(recipient->'shift_ids') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Select shifts needing cover' USING ERRCODE='23514';
    END IF;
    SELECT array_agg(DISTINCT value::uuid) INTO ids FROM jsonb_array_elements_text(recipient->'shift_ids');
    IF ids IS NULL OR array_position(ids,NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'Select shifts needing cover' USING ERRCODE='23514';
    END IF;
    PERFORM id FROM shifts WHERE business_id=_business_id AND id=ANY(ids) ORDER BY id FOR SHARE;
    SELECT count(*) INTO requested FROM shifts
      WHERE business_id=_business_id AND id=ANY(ids) AND status<>'cancelled';
    IF requested<>cardinality(ids) THEN
      RAISE EXCEPTION 'Some shifts changed or no longer need cover. Reload coverage.' USING ERRCODE='40001';
    END IF;
    SELECT md5(_business_id::text || recipient_id::text || string_agg(
      jsonb_build_array(id,shift_date,start_time,end_time,break_minutes,store_id,role_id,assigned_user_id,status)::text,'|' ORDER BY id)),
      'Cover needed: ' || string_agg(to_char(shift_date,'YYYY-MM-DD') || ' ' ||
      to_char(start_time,'HH24:MI') || '–' || to_char(end_time,'HH24:MI'),', ' ORDER BY shift_date,start_time,id) || '. Tap to view.'
      INTO fingerprint,message FROM shifts WHERE business_id=_business_id AND id=ANY(ids);
    INSERT INTO notification_deliveries(delivery_key,business_id,user_id)
      VALUES(fingerprint,_business_id,recipient_id) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS inserted=ROW_COUNT;
    IF inserted=1 THEN
      INSERT INTO notifications(business_id,user_id,type,title,body,link)
        VALUES(_business_id,recipient_id,'shift_open_for_pickup','Shifts open for pickup',message,'/rota');
      sent := sent+1;
    ELSE existing := existing+1;
    END IF;
  END LOOP;
  RETURN QUERY SELECT sent,existing;
END $$;
REVOKE ALL ON FUNCTION public.notify_coverage_staff(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notify_coverage_staff(uuid,jsonb) TO authenticated;
