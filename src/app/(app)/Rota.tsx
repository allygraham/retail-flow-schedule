import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { useAsyncData } from '@/hooks/useAsyncData';
import { assertQueryResults } from '@/lib/queryResults';
import { DataLoadError } from '@/components/common/DataLoadError';
import type { ShiftRow } from '@/types/rows';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/authContext';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Field, Input, Select, TextArea } from '@/components/common/Field';
import { StoreSelect } from '@/components/common/StoreSelect';
import { DatePicker, parseISODate, toISODate } from '@/components/common/DatePicker';
import { Modal } from '@/components/common/Modal';
import { Avatar } from '@/components/common/Avatar';
import { fmtDate, fmtTime, hoursBetween, minutesBetween, isoDate, weekDays, weekStartFor, overlap, inRange } from '@/lib/datetime';
import { addDays, format } from 'date-fns';
import { toast } from 'sonner';
import { useHolidays } from '@/features/holidays/useHolidays';
import s from './Rota.module.scss';
import { useIsMobile } from '@/hooks/use-mobile';
import { planShiftDrop } from '@/features/rota/shiftMoves';

export default function Rota() {
  const { business, user, hasPermission } = useAuth();
  const isMobile = useIsMobile();
  const [selectedDay, setSelectedDay] = useState((new Date().getDay() + 6) % 7);
  const isMgr = hasPermission('manage_schedules');
  const [weekStart, setWeekStart] = useState<Date>(weekStartFor(new Date()));
  const [storeFilter, setStoreFilter] = useState<string>(() => sessionStorage.getItem('rota.storeFilter') ?? 'all');
  const [modal, setModal] = useState<{open: boolean; shift?: ShiftRow; date?: string}>({open: false});
  const [publishModal, setPublishModal] = useState<{open: boolean; count: number}>({open: false, count: 0});
  const [form, setForm] = useState({ store_id: '', role_id: '', assigned_user_id: '', shift_date: '', start_time: '', end_time: '', break_minutes: 0 as number | null, notes: '', is_published: false });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [activeShift, setActiveShift] = useState<ShiftRow | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const holidays = useHolidays();

  const days = weekDays(weekStart);
  const visibleDays = isMobile ? [days[selectedDay]] : days;

  const fetchReferenceData = useCallback(async () => {
    if (!business) throw new Error('No workspace');
    const [st, rl, epRaw] = await Promise.all([
      supabase.from('store_locations').select('*').eq('business_id', business.id).eq('is_active', true).order('name'),
      supabase.from('roles_catalog').select('*').eq('business_id', business.id).order('name'),
      supabase.rpc('get_rota_people', { _business_id: business.id }),
    ]);
    assertQueryResults(st, rl, epRaw);
    const ep = { data: epRaw.data ?? [] };
    const nameById = Object.fromEntries(ep.data.map(e => [e.user_id, e.full_name ?? 'Employee']));
    const storesByProfile = Object.fromEntries(ep.data.map(e => [e.id, new Set(e.store_ids)]));
    const people = (ep.data ?? []).map((e) => {
      const ids = new Set<string>(storesByProfile[e.id] ?? []);
      if (e.primary_store_id) ids.add(e.primary_store_id);
      return {
        user_id: e.user_id,
        name: nameById[e.user_id] ?? 'Employee',
        primary_role_id: e.primary_role_id,
        primary_store_id: e.primary_store_id,
        store_ids: Array.from(ids),
      };
    });
    return { stores: st.data ?? [], roles: rl.data ?? [], people };
  }, [business]);
  const reference = useAsyncData(fetchReferenceData, 'Could not load the rota. Please try again.');
  const fetchWeekData = useCallback(async () => {
    if (!business) throw new Error('No workspace');
    const [sh, lv] = await Promise.all([
      (isMgr
        ? supabase.from('shifts').select('*').eq('business_id', business.id).gte('shift_date', isoDate(weekStart)).lte('shift_date', isoDate(addDays(weekStart, 6))).order('start_time')
        : supabase.from('shifts').select('*').eq('business_id', business.id).eq('is_published', true).not('assigned_user_id', 'is', null).gte('shift_date', isoDate(weekStart)).lte('shift_date', isoDate(addDays(weekStart, 6))).order('start_time')),
      supabase.rpc('get_leave_requests', { _business_id: business.id }).in('status', ['approved','pending']).lte('start_date', isoDate(addDays(weekStart, 6))).gte('end_date', isoDate(weekStart)),
    ]);
    assertQueryResults(sh, lv);
    return { shifts: sh.data ?? [], leave: lv.data ?? [] };
  }, [business, weekStart, isMgr]);
  const week = useAsyncData(fetchWeekData, 'Could not load the rota. Please try again.');
  const loading = reference.loading || week.loading;
  const loadError = reference.error || week.error;
  const load = async () => { await Promise.all([reference.reload(), week.reload()]); };
  const { stores, roles, people } = reference.data ?? { stores: [], roles: [], people: [] };
  const { shifts, leave } = useMemo(() => week.data ?? { shifts: [], leave: [] }, [week.data]);
  const gridBusy = loading || holidays.loading;
  const gridRef = useRef<HTMLDivElement>(null);
  const gridHeight = useRef(0);
  const gridContext = `${business?.id}:${isMgr}:${isMobile}:${storeFilter}`;
  const previousGridContext = useRef(gridContext);
  if (previousGridContext.current !== gridContext) {
    previousGridContext.current = gridContext;
    gridHeight.current = 0;
  }
  useLayoutEffect(() => {
    if (!gridBusy && gridRef.current) gridHeight.current = gridRef.current.getBoundingClientRect().height;
  });

  const filteredShifts = useMemo(() =>
    shifts.filter(x => storeFilter === 'all' || x.store_id === storeFilter)
  , [shifts, storeFilter]);

  const weeklyHours = useMemo(() => {
    const minutes: Record<string, number> = {};
    for (const shift of filteredShifts) {
      if (!shift.assigned_user_id || shift.status === 'cancelled') continue;
      minutes[shift.assigned_user_id] = (minutes[shift.assigned_user_id] ?? 0)
        + minutesBetween(shift.start_time, shift.end_time, shift.break_minutes ?? 0);
    }
    return Object.fromEntries(Object.entries(minutes).map(([id, total]) => [id, +(total / 60).toFixed(2)]));
  }, [filteredShifts]);

  const peopleById = useMemo(() => Object.fromEntries(people.map(p => [p.user_id, p])), [people]);
  const storeById = useMemo(() => Object.fromEntries(stores.map(s => [s.id, s])), [stores]);
  const roleById = useMemo(() => Object.fromEntries(roles.map(r => [r.id, r])), [roles]);

  // People shown as rows: filtered by selected store (membership OR a shift in that store this week).
  const matchingPeople = useMemo(() => {
    if (storeFilter === 'all') return people;
    const assignedHere = new Set(
      shifts.filter(sh => sh.store_id === storeFilter && sh.assigned_user_id).map(sh => sh.assigned_user_id),
    );
    return people.filter(p => p.store_ids?.includes(storeFilter) || assignedHere.has(p.user_id));
  }, [people, shifts, storeFilter]);
  // Keep shift-only staff rows present while changing weeks, scoped to this view.
  const previousPeople = useRef<{ context: string; people: typeof matchingPeople } | null>(null);
  const visiblePeople = gridBusy && previousPeople.current?.context === gridContext
    ? previousPeople.current.people : matchingPeople;
  useLayoutEffect(() => {
    if (!gridBusy) previousPeople.current = { context: gridContext, people: matchingPeople };
  }, [gridBusy, gridContext, matchingPeople]);

  const draftCount = useMemo(() => filteredShifts.filter(x => !x.is_published && x.status !== 'cancelled').length, [filteredShifts]);

  const conflictsFor = (sh: ShiftRow): string[] => {
    const c: string[] = [];
    if (!sh.assigned_user_id) return c;
    // overlap with another shift same person same day
    for (const other of shifts) {
      if (other.id !== sh.id && other.assigned_user_id === sh.assigned_user_id && other.shift_date === sh.shift_date && other.status !== 'cancelled' && sh.status !== 'cancelled' && overlap(sh.start_time, sh.end_time, other.start_time, other.end_time)) {
        c.push('Overlap'); break;
      }
    }
    // leave conflict — only approved leave is a real conflict
    for (const l of leave) {
      if (l.status !== 'approved') continue;
      if (l.user_id === sh.assigned_user_id && inRange(sh.shift_date, l.start_date, l.end_date)) {
        c.push(l.leave_type === 'sick' ? 'Sick' : 'On leave'); break;
      }
    }
    return c;
  };

  const openCreate = (date: string, userId?: string) => {
    const person = userId ? peopleById[userId] : undefined;
    setForm({
      is_published: false,
      store_id: storeFilter !== 'all' ? storeFilter : (person?.primary_store_id ?? stores[0]?.id),
      shift_date: date,
      start_time: '09:00',
      end_time: '17:00',
      break_minutes: 30,
      role_id: person?.primary_role_id ?? '',
      assigned_user_id: userId ?? '',
      notes: '',
    });
    setErr(null);
    setModal({ open: true, date });
  };
  const openEdit = (sh: ShiftRow) => {
    setForm({ ...sh, role_id: sh.role_id ?? '', assigned_user_id: sh.assigned_user_id ?? '', notes: sh.notes ?? '' });
    setErr(null);
    setModal({ open: true, shift: sh });
  };

  const save = async () => {
    setErr(null);
    if (!isMgr || !business || saving) return;
    setSaving(true);
    try {
      let shiftSchema: typeof import('@/lib/validation')['shiftSchema'];
      try { ({ shiftSchema } = await import('@/lib/validation')); }
      catch { setErr('Could not load shift validation. Please try again.'); return; }
      const parsed = shiftSchema.safeParse({
        ...form, role_id: form.role_id || null, assigned_user_id: form.assigned_user_id || null,
      });
      if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }

      // Database validation applies to every write, including direct API calls.
      // Holiday lookup here gives immediate feedback while the form is open.
      // Block scheduling on a company holiday flagged as blocking (custom only).
      if (parsed.data.assigned_user_id) {
        const blocking = holidays.getBlocking(parsed.data.shift_date);
        if (blocking) {
          setErr(`Scheduling is blocked on ${blocking.name} (${parsed.data.shift_date}). Remove or unblock this company holiday in Settings to assign a shift.`);
          return;
        }
      }

      const payload = { ...parsed.data,
        business_id: business!.id,
        status: (parsed.data.assigned_user_id ? 'scheduled' : 'unassigned') as 'scheduled' | 'unassigned',
      };
      if (modal.shift) {
        const { data, error } = await supabase.from('shifts').update(payload)
          .eq('business_id', business.id).eq('id', modal.shift.id)
          .eq('updated_at', modal.shift.updated_at).select('id');
        if (error) { setErr(error.message); return; }
        if (!data?.length) { setErr('Shift has changed. Close this form and refresh the rota before editing again.'); return; }
      } else {
        const { error } = await supabase.from('shifts').insert({ ...payload, created_by: user?.id });
        if (error) { setErr(error.message); return; }
      }
      // Informational warning when scheduling on a public holiday (custom is blocked above)
      const hol = parsed.data.assigned_user_id ? holidays.get(parsed.data.shift_date) : undefined;
      if (hol && hol.kind !== 'custom') {
        toast.warning(`Heads up: ${parsed.data.shift_date} is ${hol.name} (public holiday).`);
      }
      setModal({ open: false }); load();
    } catch {
      setErr('Could not save the shift. Please try again.');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!modal.shift) return;
    const id = modal.shift.id;
    toast('Delete this shift?', {
      action: {
        label: 'Delete',
        onClick: async () => {
          const { error } = await supabase.from('shifts').delete().eq('id', id);
          if (error) { toast.error(error.message); return; }
          setModal({ open: false });
          toast.success('Shift deleted');
          load();
        },
      },
      cancel: { label: 'Cancel', onClick: () => {} },
    });
  };

  const performCopyPreviousWeek = async () => {
    if (!business || copying) return;
    setCopying(true);
    try {
      const prevStart = addDays(weekStart, -7);
      const prevEnd = addDays(weekStart, -1);
      let q = supabase.from('shifts').select('*').eq('business_id', business.id)
        .gte('shift_date', isoDate(prevStart)).lte('shift_date', isoDate(prevEnd)).neq('status', 'cancelled');
      if (storeFilter !== 'all') q = q.eq('store_id', storeFilter);
      const { data: prev, error } = await q;
      if (error) { toast.error(error.message); return; }
      if (!prev || prev.length === 0) { toast.info('No shifts found in the previous week.'); return; }
      const rows = prev.map((s) => ({
        business_id: business.id,
        store_id: s.store_id,
        role_id: s.role_id,
        assigned_user_id: s.assigned_user_id,
        shift_date: isoDate(addDays(parseISODate(s.shift_date)!, 7)),
        start_time: s.start_time,
        end_time: s.end_time,
        break_minutes: s.break_minutes ?? 0,
        notes: s.notes,
        is_published: false,
        status: (s.assigned_user_id ? 'scheduled' : 'unassigned') as 'scheduled' | 'unassigned',
        created_by: user?.id,
      }));
      const { error: insErr } = await supabase.from('shifts').insert(rows);
      if (insErr) { toast.error(insErr.message); return; }
      toast.success(`Copied ${rows.length} shift${rows.length === 1 ? '' : 's'} from last week`);
      load();
    } catch { toast.error('Could not copy shifts. Please try again.'); }
    finally { setCopying(false); }
  };

  const copyPreviousWeek = async () => {
    if (!isMgr || !business) return;
    if (filteredShifts.length > 0) {
      toast('This week already has shifts. Copy from last week anyway?', {
        action: { label: 'Copy', onClick: () => performCopyPreviousWeek() },
        cancel: { label: 'Cancel', onClick: () => {} },
      });
      return;
    }
    performCopyPreviousWeek();
  };

  const openPublishConfirm = () => {
    if (!isMgr) return;
    const count = filteredShifts.filter(x => !x.is_published && x.status !== 'cancelled').length;
    if (count === 0) return;
    setPublishModal({ open: true, count });
  };

  const confirmPublish = async () => {
    if (!isMgr || !business) return;
    const drafts = filteredShifts.filter(x => !x.is_published && x.status !== 'cancelled');
    const ids = drafts.map(x => x.id);
    if (ids.length === 0) return;

    if (publishing) return;
    setPublishing(true);
    try {
      const { data, error } = await supabase.rpc('publish_rota_shifts', { _business_id: business.id, _shift_ids: ids, _week_start: isoDate(weekStart) });
      if (error) throw error;
      if (!data?.[0]) throw new Error('Publishing returned no result');
      const result = data[0];
      toast.success(result.published_count ? `${result.published_count} shifts published · ${result.notified_count} employees notified in the app` : 'These shifts are already published');
      setPublishModal({ open: false, count: 0 });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message ?? 'Could not publish schedule');
    } finally { setPublishing(false); }
  };

  const onDragStart = (e: DragStartEvent) => {
    const sh = shifts.find(x => x.id === e.active.id);
    if (sh) setActiveShift(sh);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveShift(null);
    if (!isMgr || !e.over) return;
    const dragged = shifts.find(x => x.id === e.active.id);
    if (!dragged) return;
    const [targetUserId, targetDate] = String(e.over.id).split('|');
    const newAssigned = targetUserId === 'unassigned' ? null : targetUserId;
    if (dragged.assigned_user_id === newAssigned && dragged.shift_date === targetDate) return;

    if (!business || moving) return;
    try {
      const plan = planShiftDrop(filteredShifts, dragged, newAssigned, targetDate);
      if (!plan) return;
      setMoving(true);
      const { error } = await supabase.rpc('move_rota_shift', { _business_id: business.id, ...plan });
      if (error) { toast.error(error.message); await load(); return; }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not move the shift. Please try again.');
      return;
    } finally { setMoving(false); }
    // Informational warning when dragging a person onto a public holiday (custom is blocked above)
    if (newAssigned) {
      const hol = holidays.get(targetDate);
      if (hol && hol.kind !== 'custom') {
        toast.warning(`Heads up: ${targetDate} is ${hol.name} (public holiday).`);
      }
    }
  };

  const pageHeader = (
<header className={s.header}>
        <div>
          <span className={s.eye}>Rota</span>
          <h1 className={s.h1}>Week of {fmtDate(weekStart, 'd MMM yyyy')}</h1>
        </div>
        <div className={s.controls}>
          {isMgr && <Button variant="outline" onClick={copyPreviousWeek} loading={copying} disabled={gridBusy || !!loadError || !!holidays.error}>Copy previous week</Button>}
          <div className={s.weekNav} role="group" aria-label="Week navigation">
            <button type="button" className={s.navBtn} onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">‹ Prev</button>
            <button type="button" className={s.navBtn} onClick={() => setWeekStart(weekStartFor(new Date()))}>Current week</button>
            <button type="button" className={s.navBtn} onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">Next ›</button>
          </div>
          <StoreSelect
            value={storeFilter}
            options={stores.map(st => ({ id: st.id, name: st.name }))}
            onChange={(v) => { setStoreFilter(v); sessionStorage.setItem('rota.storeFilter', v); }}
          />
          {isMgr && !holidays.error && (
            <Button onClick={openPublishConfirm} disabled={loading || holidays.loading || draftCount === 0}>
              Publish{draftCount > 0 ? ` (${draftCount})` : ''}
            </Button>
          )}
        </div>
      </header>
  );
  const dayControl = (isMobile && <Field label="Rota day">
        <Select aria-label="Rota day" value={selectedDay} onChange={event => setSelectedDay(Number(event.target.value))}>
          {days.map((day, index) => <option key={index} value={index}>{fmtDate(day, 'EEEE d MMM')}</option>)}
        </Select>
        <p className={s.mobileHint}>{isMgr ? 'Tap a shift to edit its date or assignment.' : 'Choose a day to see your shifts.'}</p>
      </Field>);
  if (holidays.error) return <div className={s.page}>{pageHeader}<DataLoadError message={holidays.error} retry={holidays.reload} /></div>;
  if (loadError) return <div className={s.page}>{pageHeader}<DataLoadError message={loadError} retry={load} /></div>;
  if (!reference.data) return <div className={s.page}>{pageHeader}{dayControl}<Card padded={false}><LoadingSkeleton layout="rota-content" label="Loading rota" /></Card></div>;

  return (
    <div className={s.page}>
      {pageHeader}


      {dayControl}
      <Card padded={false}>
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div ref={gridRef} aria-label="Weekly rota" aria-busy={gridBusy} style={{ minHeight: gridBusy ? gridHeight.current : undefined }} className={`${s.grid} ${!isMgr ? s.gridEmployee : ''} ${isMobile ? s.gridMobile : ''}`}>
            {isMgr && <div className={`${s.gridHead} ${s.gridHeadStaff}`}>Staff</div>}
            {visibleDays.map(d => {
              const dStr = isoDate(d);
              const hol = holidays.get(dStr);
              return (
                <div key={dStr} className={`${s.gridHead} ${s.gridHeadDay} ${hol ? s.gridHeadDayHoliday : ''}`}>
                  <div className={s.dayName}>{format(d, 'EEE')}</div>
                  <div className={s.dayDate}>{format(d, 'd MMM')}</div>
                  {hol && (
                    <div className={s.holidayLabel} title={hol.name}>
                      <span className={s.holidayDot} />{hol.name}
                    </div>
                  )}
                </div>
              );
            })}
            {isMgr && <div className={`${s.gridHead} ${s.gridHeadTotal}`}>Total</div>}
            {/* per-employee rows */}
            {visiblePeople.map(p => (
              <div key={p.user_id} className={s.contents}>
                {isMgr && (
                  <div className={s.staffCell}>
                    <Avatar name={p.name} size="sm" />
                    <div>
                      <div className={s.staffName}>{p.name}</div>
                      <div className={s.staffRole}>{roleById[p.primary_role_id ?? '']?.name ?? '—'}</div>
                      {isMobile && <div className={s.staffRole} aria-label={`${p.name} weekly hours`}>{gridBusy ? '…' : `${weeklyHours[p.user_id] ?? 0}h this week`}</div>}
                    </div>
                  </div>
                )}
                {visibleDays.map(d => {
                  const dStr = isoDate(d);
                  const cell = filteredShifts.filter(sh => sh.assigned_user_id === p.user_id && sh.shift_date === dStr);
                  const onLeave = leave.find(l => l.user_id === p.user_id && inRange(dStr, l.start_date, l.end_date) && l.status === 'approved');
                  const hol = holidays.get(dStr);
                  return (
                    <DroppableCell key={dStr} id={`${p.user_id}|${dStr}`} disabled={gridBusy || !isMgr || !!onLeave}
                      className={hol ? s.cellHoliday : ''}
                      onClick={() => !gridBusy && isMgr && cell.length === 0 && !onLeave && openCreate(dStr, p.user_id)}>
                      {gridBusy && <div className={s.cellSkeleton} aria-hidden="true" />}
                      {!gridBusy && onLeave && (
                        <div className={`${s.shift} ${s[onLeave.leave_type]}`}>
                          <div className={s.shiftTime}>{onLeave.leave_type === 'sick' ? 'Sick' : 'Leave'}</div>
                        </div>
                      )}
                      {!gridBusy && cell.map(sh => (
                        <DraggableShift key={sh.id} id={sh.id} disabled={!isMgr || isMobile || moving || sh.status === 'cancelled'}>
                          <div className={`${s.shift} ${sh.status === 'cancelled' ? s.cancelled : ''} ${!sh.is_published ? s.draft : ''}`}
                            onClick={(e) => { e.stopPropagation(); if (isMgr) openEdit(sh); }}
                            style={{ borderLeftColor: roleById[sh.role_id ?? '']?.color ?? undefined }}
                          >
                            <div className={s.shiftTime}>{fmtTime(sh.start_time)}–{fmtTime(sh.end_time)}</div>
                            <div className={s.shiftMeta}>{storeById[sh.store_id]?.name} · {hoursBetween(sh.start_time, sh.end_time, sh.break_minutes ?? 0)}h</div>
                            {conflictsFor(sh).length > 0 && <Badge tone="danger">⚠ {conflictsFor(sh).join(', ')}</Badge>}
                            {!sh.is_published && <Badge tone="warning">Draft</Badge>}
                          </div>
                        </DraggableShift>
                      ))}
                    </DroppableCell>
                  );
                })}
                {isMgr && <div className={s.totalCell} aria-label={`${p.name} weekly hours`} title="Scheduled hours this week, excluding breaks and cancelled shifts">
                  {gridBusy ? <div className={s.totalSkeleton} aria-hidden="true" /> : <>{weeklyHours[p.user_id] ?? 0}<span className={s.totalUnit}>h</span></>}
                </div>}
              </div>
            ))}
            {/* Unassigned row — managers only */}
            {isMgr && (
              <div className={s.contents}>
                <div className={s.staffCell}>
                  <Avatar name="?" size="sm" />
                  <div><div className={s.staffName}>Unassigned</div><div className={s.staffRole}>Open shifts</div></div>
                </div>
                {visibleDays.map(d => {
                  const dStr = isoDate(d);
                  const cell = filteredShifts.filter(sh => !sh.assigned_user_id && sh.shift_date === dStr);
                  const hol = holidays.get(dStr);
                  return (
                    <DroppableCell key={dStr} id={`unassigned|${dStr}`} disabled={gridBusy || !isMgr}
                      className={hol ? s.cellHoliday : ''}
                      onClick={() => !gridBusy && isMgr && openCreate(dStr)}>
                      {gridBusy && <div className={s.cellSkeleton} aria-hidden="true" />}
                      {!gridBusy && cell.map(sh => (
                        <DraggableShift key={sh.id} id={sh.id} disabled={!isMgr || isMobile || moving || sh.status === 'cancelled'}>
                          <div className={`${s.shift} ${s.openShift}`} onClick={(e) => { e.stopPropagation(); if (isMgr) openEdit(sh); }}>
                            <div className={s.shiftTime}>{fmtTime(sh.start_time)}–{fmtTime(sh.end_time)}</div>
                            <div className={s.shiftMeta}>{storeById[sh.store_id]?.name} · {roleById[sh.role_id ?? '']?.name ?? 'Floor'}</div>
                            <Badge tone="unassigned" dot>Needs cover</Badge>
                          </div>
                        </DraggableShift>
                      ))}
                    </DroppableCell>
                  );
                })}
                <div className={s.totalCell} />
              </div>
            )}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeShift && (
              <div className={`${s.shift} ${s.dragGhost}`} style={{ borderLeftColor: roleById[activeShift.role_id ?? '']?.color ?? undefined }}>
                <div className={s.shiftTime}>{fmtTime(activeShift.start_time)}–{fmtTime(activeShift.end_time)}</div>
                <div className={s.shiftMeta}>{storeById[activeShift.store_id]?.name}</div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </Card>

      {!gridBusy && filteredShifts.length === 0 && (
        <div className={s.emptyBanner}>
          <span className={s.emptyIcon}>ℹ️</span>
          <span className={s.emptyText}>{isMgr ? 'No shifts this week — click any cell to add one.' : 'Your manager hasn\'t published this week yet.'}</span>
        </div>
      )}

      <Modal open={modal.open} onClose={() => setModal({open: false})}
        title={modal.shift ? 'Edit shift' : 'New shift'}
        footer={
          <>
            {modal.shift && <Button variant="danger" onClick={remove}>Delete</Button>}
            <Button variant="ghost" onClick={() => setModal({open: false})}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </>
        }>
        <div className={s.form}>
          <Field label="Date">
            <DatePicker
              value={parseISODate(form.shift_date)}
              onChange={(d) => setForm({ ...form, shift_date: toISODate(d) })}
              placeholder="Pick a date"
            />
          </Field>
          <div className={s.row2}>
            <Field label="Start"><Input type="time" value={form.start_time ?? ''} onChange={e => setForm({...form, start_time: e.target.value})}/></Field>
            <Field label="End"><Input type="time" value={form.end_time ?? ''} onChange={e => setForm({...form, end_time: e.target.value})}/></Field>
          </div>
          <div className={s.row2}>
            <Field label="Store">
              <Select value={form.store_id ?? ''} onChange={e => setForm({...form, store_id: e.target.value})}>
                <option value="">Pick a store…</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Role">
              <Select value={form.role_id ?? ''} onChange={e => setForm({...form, role_id: e.target.value})}>
                <option value="">— None —</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Assign to">
            <Select value={form.assigned_user_id ?? ''} onChange={e => setForm({...form, assigned_user_id: e.target.value})}>
              <option value="">Leave unassigned</option>
              {people.map(p => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
            </Select>
          </Field>
          <div className={s.row2}>
            <Field label="Break (min)"><Input type="number" min={0} value={form.break_minutes ?? 0} onChange={e => setForm({...form, break_minutes: +e.target.value})}/></Field>
            <Field label="Published">
              <Select value={form.is_published ? 'true' : 'false'} onChange={e => setForm({...form, is_published: e.target.value === 'true'})}>
                <option value="false">Draft</option>
                <option value="true">Published</option>
              </Select>
            </Field>
          </div>
          <Field label="Notes"><TextArea value={form.notes ?? ''} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Optional notes for this shift"/></Field>
          {err && <div className={s.err}>{err}</div>}
        </div>
      </Modal>

      {/* Publish confirmation modal */}
      <Modal open={publishModal.open} onClose={() => setPublishModal({ open: false, count: 0 })} title="Publish schedule" size="sm">
        <div style={{ lineHeight: 1.6 }}>
          <p className="text-justify">
            You are about to publish <strong>{publishModal.count} draft shift{publishModal.count === 1 ? '' : 's'}</strong>.
          </p>
          <ul style={{ margin: '12px 0', paddingLeft: 20 }}>
            <li>Week: <strong>{fmtDate(weekStart, 'd MMM yyyy')}</strong></li>
            <li>Store: <strong>{storeFilter === 'all' ? 'All stores' : storeById[storeFilter]?.name ?? 'Selected store'}</strong></li>
          </ul>
          <p className="text-justify" style={{ color: 'var(--muted)', fontSize: 14 }}>
            Published shifts will be visible to employees.
          </p>
        </div>
        <div slot="footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setPublishModal({ open: false, count: 0 })}>Cancel</Button>
          <Button onClick={confirmPublish} loading={publishing}>Publish {publishModal.count} shift{publishModal.count === 1 ? '' : 's'}</Button>
        </div>
      </Modal>

    </div>
  );
}

function DroppableCell({ id, disabled, onClick, className, children }: { id: string; disabled?: boolean; onClick?: () => void; className?: string; children: ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id, disabled });
  return (
    <div ref={setNodeRef} data-rota-cell={id} className={`${s.cell} ${className ?? ''} ${isOver ? s.cellOver : ''}`} onClick={onClick}>
      {children}
    </div>
  );
}

function DraggableShift({ id, disabled, children }: { id: string; disabled?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });
  return (
    <div ref={setNodeRef} data-shift-id={id} {...(disabled ? {} : attributes)} {...listeners} style={{ opacity: isDragging ? 0.4 : 1, touchAction: disabled ? 'auto' : 'none', cursor: disabled ? 'pointer' : 'grab' }}>
      {children}
    </div>
  );
}
