-- Serialise scheduling writes within a business. Volatile trigger queries use
-- fresh snapshots after acquiring the lock, including concurrent API writes.
CREATE OR REPLACE FUNCTION public.prepare_shift_write()
RETURNS trigger LANGUAGE plpgsql VOLATILE SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'A shift cannot be moved to another business' USING ERRCODE='23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_id::text,41030));
  IF NEW.status <> 'cancelled' THEN
    NEW.status := CASE WHEN NEW.assigned_user_id IS NULL THEN 'unassigned'::public.shift_status ELSE 'scheduled'::public.shift_status END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prepare_shift_write ON public.shifts;
CREATE TRIGGER prepare_shift_write BEFORE INSERT OR UPDATE ON public.shifts
FOR EACH ROW EXECUTE FUNCTION public.prepare_shift_write();

-- Version checks must detect successive changes even inside one transaction.
CREATE OR REPLACE FUNCTION public.touch_shift_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.updated_at := greatest(clock_timestamp(),OLD.updated_at + interval '1 microsecond');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_shifts_updated ON public.shifts;
CREATE TRIGGER trg_shifts_updated BEFORE UPDATE ON public.shifts
FOR EACH ROW EXECUTE FUNCTION public.touch_shift_updated_at();

-- Deferred validation reads the final row: swaps must not be rejected for
-- temporary overlaps while the two assignments are being exchanged.
CREATE OR REPLACE FUNCTION public.validate_shift_assignment()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.shifts%ROWTYPE; holiday_name text;
BEGIN
  SELECT * INTO s FROM public.shifts WHERE id=NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF s.end_time <= s.start_time THEN
    RAISE EXCEPTION 'Shift end time must be after start time' USING ERRCODE='23514';
  END IF;
  IF s.break_minutes IS NULL OR s.break_minutes < 0 OR s.break_minutes > 240
    OR s.break_minutes >= extract(epoch FROM (s.end_time-s.start_time))/60 THEN
    RAISE EXCEPTION 'Break must be between 0 and 240 minutes and shorter than the shift' USING ERRCODE='23514';
  END IF;
  IF char_length(s.notes)>500 THEN
    RAISE EXCEPTION 'Shift notes must be no longer than 500 characters' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.store_locations st WHERE st.id=s.store_id AND st.business_id=s.business_id) THEN
    RAISE EXCEPTION 'Store must belong to this business' USING ERRCODE='23514';
  END IF;
  IF s.role_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.roles_catalog r WHERE r.id=s.role_id AND r.business_id=s.business_id) THEN
    RAISE EXCEPTION 'Shift role must belong to this business' USING ERRCODE='23514';
  END IF;
  IF s.schedule_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.schedules sc WHERE sc.id=s.schedule_id AND sc.business_id=s.business_id) THEN
    RAISE EXCEPTION 'Schedule must belong to this business' USING ERRCODE='23514';
  END IF;
  -- Cancelling or releasing a shift remains possible after a store/member retires.
  IF s.status='cancelled' OR s.assigned_user_id IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.store_locations st WHERE st.id=s.store_id AND st.is_active) THEN
    RAISE EXCEPTION 'Assigned shifts require an active store' USING ERRCODE='23514';
  END IF;
  IF NOT public.is_member(s.assigned_user_id,s.business_id) THEN
    RAISE EXCEPTION 'Assigned employee must be an active member of this business' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.employee_profiles ep WHERE ep.user_id=s.assigned_user_id AND ep.business_id=s.business_id
    AND (ep.primary_store_id=s.store_id OR EXISTS(SELECT 1 FROM public.employee_stores es WHERE es.employee_profile_id=ep.id AND es.store_id=s.store_id))) THEN
    RAISE EXCEPTION 'Employee is not assigned to this store' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.leave_requests l WHERE l.business_id=s.business_id AND l.user_id=s.assigned_user_id
    AND l.status='approved' AND s.shift_date BETWEEN l.start_date AND l.end_date) THEN
    RAISE EXCEPTION 'Employee is on approved leave on %',s.shift_date USING ERRCODE='23514';
  END IF;
  SELECT h.name INTO holiday_name FROM public.custom_holidays h
    WHERE h.business_id=s.business_id AND h.date=s.shift_date AND h.blocks_scheduling LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Scheduling is blocked on % (%)',holiday_name,s.shift_date USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.availability a WHERE a.business_id=s.business_id AND a.user_id=s.assigned_user_id
    AND ((a.is_recurring AND a.day_of_week=extract(dow FROM s.shift_date)) OR (NOT coalesce(a.is_recurring,false) AND a.unavailable_date=s.shift_date))
    AND (a.start_time IS NULL OR a.end_time IS NULL OR (a.start_time<s.end_time AND s.start_time<a.end_time))) THEN
    RAISE EXCEPTION 'Employee is unavailable during this shift' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.shifts other WHERE other.business_id=s.business_id AND other.id<>s.id
    AND other.assigned_user_id=s.assigned_user_id AND other.shift_date=s.shift_date AND other.status<>'cancelled'
    AND other.start_time<s.end_time AND s.start_time<other.end_time) THEN
    RAISE EXCEPTION 'Employee already has an overlapping shift on %',s.shift_date USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.validate_shift_assignment() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS validate_shift_assignment ON public.shifts;
CREATE CONSTRAINT TRIGGER validate_shift_assignment AFTER INSERT OR UPDATE ON public.shifts
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_shift_assignment();

-- Both rows are locked, checked against the versions seen by the manager, and
-- updated in one transaction. Any validation error rolls back the whole swap.
CREATE OR REPLACE FUNCTION public.move_rota_shift(
  _business_id uuid,_shift_id uuid,_assigned_user_id uuid,_shift_date date,_expected_updated_at timestamptz,
  _swap_shift_id uuid DEFAULT NULL,_swap_expected_updated_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public AS $$
DECLARE source public.shifts%ROWTYPE; target public.shifts%ROWTYPE; changed integer;
BEGIN
  IF NOT public.is_manager_or_owner(auth.uid(),_business_id) THEN
    RAISE EXCEPTION 'Active management membership is required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,41030));
  PERFORM 1 FROM public.shifts WHERE business_id=_business_id AND id IN (_shift_id,_swap_shift_id) ORDER BY id FOR UPDATE;
  SELECT * INTO source FROM public.shifts WHERE id=_shift_id AND business_id=_business_id;
  IF NOT FOUND OR source.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'Shift has changed. Refresh the rota and try again.' USING ERRCODE='40001';
  END IF;
  IF source.status='cancelled' THEN
    RAISE EXCEPTION 'Cancelled shifts cannot be dragged' USING ERRCODE='23514';
  END IF;
  IF _swap_shift_id IS NOT NULL THEN
    IF _swap_shift_id=_shift_id THEN
      RAISE EXCEPTION 'A shift cannot be swapped with itself' USING ERRCODE='23514';
    END IF;
    SELECT * INTO target FROM public.shifts WHERE id=_swap_shift_id AND business_id=_business_id;
    IF NOT FOUND OR target.updated_at IS DISTINCT FROM _swap_expected_updated_at
      OR target.shift_date IS DISTINCT FROM _shift_date OR target.assigned_user_id IS DISTINCT FROM _assigned_user_id THEN
      RAISE EXCEPTION 'Target shift has changed. Refresh the rota and try again.' USING ERRCODE='40001';
    END IF;
    IF target.status='cancelled' THEN
      RAISE EXCEPTION 'Cancelled shifts cannot be swapped' USING ERRCODE='23514';
    END IF;
  END IF;
  UPDATE public.shifts SET
    assigned_user_id=CASE WHEN id=_shift_id THEN _assigned_user_id ELSE source.assigned_user_id END,
    shift_date=CASE WHEN id=_shift_id THEN _shift_date ELSE source.shift_date END
    WHERE business_id=_business_id AND id IN (_shift_id,_swap_shift_id);
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed <> (CASE WHEN _swap_shift_id IS NULL THEN 1 ELSE 2 END) THEN
    RAISE EXCEPTION 'Could not update every shift. Refresh the rota and try again.' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.move_rota_shift(uuid,uuid,uuid,date,timestamptz,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.move_rota_shift(uuid,uuid,uuid,date,timestamptz,uuid,timestamptz) TO authenticated;
