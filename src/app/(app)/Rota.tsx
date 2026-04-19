import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Field, Input, Select, TextArea } from '@/components/common/Field';
import { Modal } from '@/components/common/Modal';
import { Avatar } from '@/components/common/Avatar';
import { EmptyState } from '@/components/common/EmptyState';
import { fmtDate, fmtTime, hoursBetween, isoDate, weekDays, weekStartFor, overlap, inRange } from '@/lib/datetime';
import { addDays, format } from 'date-fns';
import { shiftSchema } from '@/lib/validation';
import { toast } from 'sonner';
import s from './Rota.module.scss';

export default function Rota() {
  const { business, role, user } = useAuth();
  const isMgr = role === 'owner' || role === 'manager';
  const [weekStart, setWeekStart] = useState<Date>(weekStartFor(new Date()));
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [stores, setStores] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [leave, setLeave] = useState<any[]>([]);
  const [modal, setModal] = useState<{open: boolean; shift?: any; date?: string}>({open: false});
  const [form, setForm] = useState<any>({});
  const [err, setErr] = useState<string | null>(null);
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const days = weekDays(weekStart);
  const weekEnd = addDays(weekStart, 6);

  const load = async () => {
    if (!business) return;
    const [st, rl, ep, sh, lv] = await Promise.all([
      supabase.from('store_locations').select('*').eq('business_id', business.id).eq('is_active', true).order('name'),
      supabase.from('roles_catalog').select('*').eq('business_id', business.id).order('name'),
      supabase.from('employee_profiles').select('user_id, primary_role_id, primary_store_id').eq('business_id', business.id),
      supabase.from('shifts').select('*').eq('business_id', business.id).gte('shift_date', isoDate(weekStart)).lte('shift_date', isoDate(weekEnd)).order('start_time'),
      supabase.from('leave_requests').select('*').eq('business_id', business.id).in('status', ['approved','pending']).lte('start_date', isoDate(weekEnd)).gte('end_date', isoDate(weekStart)),
    ]);
    const userIds = (ep.data ?? []).map((e:any) => e.user_id);
    const pf = userIds.length
      ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
      : { data: [] as any[] };
    const nameById: Record<string,string> = Object.fromEntries((pf.data ?? []).map((p:any) => [p.id, p.full_name ?? 'Employee']));
    setStores(st.data ?? []); setRoles(rl.data ?? []);
    setPeople((ep.data ?? []).map((e:any) => ({ user_id: e.user_id, name: nameById[e.user_id] ?? 'Employee', primary_role_id: e.primary_role_id, primary_store_id: e.primary_store_id })));
    setShifts(sh.data ?? []); setLeave(lv.data ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [business, weekStart]);

  const filteredShifts = useMemo(() =>
    shifts.filter(x => storeFilter === 'all' || x.store_id === storeFilter)
  , [shifts, storeFilter]);

  const peopleById = useMemo(() => Object.fromEntries(people.map(p => [p.user_id, p])), [people]);
  const storeById = useMemo(() => Object.fromEntries(stores.map(s => [s.id, s])), [stores]);
  const roleById = useMemo(() => Object.fromEntries(roles.map(r => [r.id, r])), [roles]);

  // Total scheduled hours per employee for the visible week (respects store filter).
  const hoursByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const sh of filteredShifts) {
      if (!sh.assigned_user_id || sh.status === 'cancelled') continue;
      const h = hoursBetween(sh.start_time, sh.end_time, sh.break_minutes ?? 0);
      map.set(sh.assigned_user_id, (map.get(sh.assigned_user_id) ?? 0) + h);
    }
    return map;
  }, [filteredShifts]);
  const totalWeekHours = useMemo(
    () => Array.from(hoursByUser.values()).reduce((a, b) => a + b, 0),
    [hoursByUser],
  );
  const openHours = useMemo(
    () => filteredShifts
      .filter(sh => !sh.assigned_user_id && sh.status !== 'cancelled')
      .reduce((a, sh) => a + hoursBetween(sh.start_time, sh.end_time, sh.break_minutes ?? 0), 0),
    [filteredShifts],
  );
  const fmtH = (n: number) => (Math.round(n * 10) / 10).toString();

  const conflictsFor = (sh: any): string[] => {
    const c: string[] = [];
    if (!sh.assigned_user_id) return c;
    // overlap with another shift same person same day
    for (const other of shifts) {
      if (other.id !== sh.id && other.assigned_user_id === sh.assigned_user_id && other.shift_date === sh.shift_date && overlap(sh.start_time, sh.end_time, other.start_time, other.end_time)) {
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

  const openCreate = (date: string) => {
    setForm({ store_id: storeFilter !== 'all' ? storeFilter : stores[0]?.id, shift_date: date, start_time: '09:00', end_time: '17:00', break_minutes: 30, role_id: '', assigned_user_id: '', notes: '' });
    setErr(null);
    setModal({ open: true, date });
  };
  const openEdit = (sh: any) => {
    setForm({ ...sh, role_id: sh.role_id ?? '', assigned_user_id: sh.assigned_user_id ?? '', notes: sh.notes ?? '' });
    setErr(null);
    setModal({ open: true, shift: sh });
  };

  const save = async () => {
    setErr(null);
    const parsed = shiftSchema.safeParse({
      ...form, role_id: form.role_id || null, assigned_user_id: form.assigned_user_id || null,
    });
    if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
    const payload = { ...parsed.data,
      business_id: business!.id,
      status: (parsed.data.assigned_user_id ? 'scheduled' : 'unassigned') as 'scheduled' | 'unassigned',
      created_by: user?.id,
    };
    if (modal.shift) {
      const { error } = await supabase.from('shifts').update(payload).eq('id', modal.shift.id);
      if (error) { setErr(error.message); return; }
    } else {
      const { error } = await supabase.from('shifts').insert(payload as any);
      if (error) { setErr(error.message); return; }
    }
    setModal({ open: false }); load();
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
    if (!business) return;
    const prevStart = addDays(weekStart, -7);
    const prevEnd = addDays(weekStart, -1);
    let q = supabase.from('shifts').select('*').eq('business_id', business.id)
      .gte('shift_date', isoDate(prevStart)).lte('shift_date', isoDate(prevEnd));
    if (storeFilter !== 'all') q = q.eq('store_id', storeFilter);
    const { data: prev, error } = await q;
    if (error) { toast.error(error.message); return; }
    if (!prev || prev.length === 0) { toast.info('No shifts found in the previous week.'); return; }
    const rows = prev.map((s: any) => ({
      business_id: business.id,
      store_id: s.store_id,
      role_id: s.role_id,
      assigned_user_id: s.assigned_user_id,
      shift_date: isoDate(addDays(new Date(s.shift_date), 7)),
      start_time: s.start_time,
      end_time: s.end_time,
      break_minutes: s.break_minutes ?? 0,
      notes: s.notes,
      is_published: false,
      status: (s.assigned_user_id ? 'scheduled' : 'unassigned') as 'scheduled' | 'unassigned',
      created_by: user?.id,
    }));
    const { error: insErr } = await supabase.from('shifts').insert(rows as any);
    if (insErr) { toast.error(insErr.message); return; }
    toast.success(`Copied ${rows.length} shift${rows.length === 1 ? '' : 's'} from last week`);
    load();
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

  const togglePublish = async () => {
    if (!isMgr) return;
    const ids = filteredShifts.filter(x => !x.is_published).map(x => x.id);
    if (ids.length === 0) return;
    await supabase.from('shifts').update({ is_published: true }).in('id', ids);
    load();
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

    // Block drops onto an approved-leave date for the target employee
    if (newAssigned) {
      const blocked = leave.find(l =>
        l.status === 'approved' &&
        l.user_id === newAssigned &&
        inRange(targetDate, l.start_date, l.end_date)
      );
      if (blocked) {
        toast.error(`${peopleById[newAssigned]?.name ?? 'Employee'} is on approved leave that day.`);
        return;
      }
    }

    // find an occupant in the target cell (for swap). If multiple, swap with the first.
    const occupant = filteredShifts.find(x =>
      x.id !== dragged.id &&
      x.shift_date === targetDate &&
      (x.assigned_user_id ?? 'unassigned') === (newAssigned ?? 'unassigned')
    );

    // optimistic update
    setShifts(prev => prev.map(x => {
      if (x.id === dragged.id) return { ...x, assigned_user_id: newAssigned, shift_date: targetDate, status: newAssigned ? 'scheduled' : 'unassigned' };
      if (occupant && x.id === occupant.id) return { ...x, assigned_user_id: dragged.assigned_user_id, shift_date: dragged.shift_date, status: dragged.assigned_user_id ? 'scheduled' : 'unassigned' };
      return x;
    }));

    const updates: any[] = [
      supabase.from('shifts').update({
        assigned_user_id: newAssigned,
        shift_date: targetDate,
        status: (newAssigned ? 'scheduled' : 'unassigned') as 'scheduled' | 'unassigned',
      }).eq('id', dragged.id),
    ];
    if (occupant) {
      updates.push(supabase.from('shifts').update({
        assigned_user_id: dragged.assigned_user_id,
        shift_date: dragged.shift_date,
        status: (dragged.assigned_user_id ? 'scheduled' : 'unassigned') as 'scheduled' | 'unassigned',
      }).eq('id', occupant.id));
    }
    const results = await Promise.all(updates);
    if (results.some((r: any) => r.error)) load();
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <span className={s.eye}>Rota</span>
          <h1 className={s.h1}>Week of {fmtDate(weekStart, 'd MMM yyyy')}</h1>
        </div>
        <div className={s.controls}>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(weekStartFor(new Date()))}>This week</Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</Button>
          <Select value={storeFilter} onChange={e => setStoreFilter(e.target.value)}>
            <option value="all">All stores</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          {isMgr && <Button variant="outline" onClick={copyPreviousWeek}>Copy previous week</Button>}
          {isMgr && <Button onClick={togglePublish}>Publish drafts</Button>}
        </div>
      </header>


      <Card padded={false}>
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className={s.grid}>
            <div className={`${s.gridHead} ${s.gridHeadStaff}`}>Staff</div>
            {days.map(d => (
              <div key={isoDate(d)} className={`${s.gridHead} ${s.gridHeadDay}`}>
                <div className={s.dayName}>{format(d, 'EEE')}</div>
                <div className={s.dayDate}>{format(d, 'd MMM')}</div>
              </div>
            ))}
            <div className={`${s.gridHead} ${s.gridHeadTotal}`}>Total</div>
            {/* per-employee rows */}
            {people.map(p => (
              <div key={p.user_id} className={s.contents}>
                <div className={s.staffCell}>
                  <Avatar name={p.name} size="sm" />
                  <div>
                    <div className={s.staffName}>{p.name}</div>
                    <div className={s.staffRole}>{roleById[p.primary_role_id]?.name ?? '—'}</div>
                  </div>
                </div>
                {days.map(d => {
                  const dStr = isoDate(d);
                  const cell = filteredShifts.filter(sh => sh.assigned_user_id === p.user_id && sh.shift_date === dStr);
                  const onLeave = leave.find(l => l.user_id === p.user_id && inRange(dStr, l.start_date, l.end_date) && l.status === 'approved');
                  return (
                    <DroppableCell key={dStr} id={`${p.user_id}|${dStr}`} disabled={!isMgr || !!onLeave}
                      onClick={() => isMgr && cell.length === 0 && !onLeave && openCreate(dStr)}>
                      {onLeave && (
                        <div className={`${s.shift} ${s[onLeave.leave_type]}`}>
                          <div className={s.shiftTime}>{onLeave.leave_type === 'sick' ? 'Sick' : 'Leave'}</div>
                        </div>
                      )}
                      {cell.map(sh => (
                        <DraggableShift key={sh.id} id={sh.id} disabled={!isMgr}>
                          <div className={`${s.shift} ${sh.status === 'cancelled' ? s.cancelled : ''} ${!sh.is_published ? s.draft : ''}`}
                            onClick={(e) => { e.stopPropagation(); isMgr && openEdit(sh); }}
                            style={{ borderLeftColor: roleById[sh.role_id]?.color ?? undefined }}
                          >
                            <div className={s.shiftTime}>{fmtTime(sh.start_time)}–{fmtTime(sh.end_time)}</div>
                            <div className={s.shiftMeta}>{storeById[sh.store_id]?.name} · {hoursBetween(sh.start_time, sh.end_time, sh.break_minutes)}h</div>
                            {conflictsFor(sh).length > 0 && <Badge tone="danger">⚠ {conflictsFor(sh).join(', ')}</Badge>}
                            {!sh.is_published && <Badge tone="warning">Draft</Badge>}
                          </div>
                        </DraggableShift>
                      ))}
                    </DroppableCell>
                  );
                })}
                <div className={s.totalCell}>{fmtH(hoursByUser.get(p.user_id) ?? 0)}<span className={s.totalUnit}>h</span></div>
              </div>
            ))}
            {/* Unassigned row — hidden for non-managers when there's nothing to cover */}
            {(isMgr || filteredShifts.some(sh => !sh.assigned_user_id)) && (
              <div className={s.contents}>
                <div className={s.staffCell}>
                  <Avatar name="?" size="sm" />
                  <div><div className={s.staffName}>Unassigned</div><div className={s.staffRole}>Open shifts</div></div>
                </div>
                {days.map(d => {
                  const dStr = isoDate(d);
                  const cell = filteredShifts.filter(sh => !sh.assigned_user_id && sh.shift_date === dStr);
                  return (
                    <DroppableCell key={dStr} id={`unassigned|${dStr}`} disabled={!isMgr}
                      onClick={() => isMgr && openCreate(dStr)}>
                      {cell.map(sh => (
                        <DraggableShift key={sh.id} id={sh.id} disabled={!isMgr}>
                          <div className={`${s.shift} ${s.openShift}`} onClick={(e) => { e.stopPropagation(); isMgr && openEdit(sh); }}>
                            <div className={s.shiftTime}>{fmtTime(sh.start_time)}–{fmtTime(sh.end_time)}</div>
                            <div className={s.shiftMeta}>{storeById[sh.store_id]?.name} · {roleById[sh.role_id]?.name ?? 'Floor'}</div>
                            <Badge tone="unassigned" dot>Needs cover</Badge>
                          </div>
                        </DraggableShift>
                      ))}
                    </DroppableCell>
                  );
                })}
              </div>
            )}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeShift && (
              <div className={`${s.shift} ${s.dragGhost}`} style={{ borderLeftColor: roleById[activeShift.role_id]?.color ?? undefined }}>
                <div className={s.shiftTime}>{fmtTime(activeShift.start_time)}–{fmtTime(activeShift.end_time)}</div>
                <div className={s.shiftMeta}>{storeById[activeShift.store_id]?.name}</div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </Card>

      {filteredShifts.length === 0 && (
        <Card><EmptyState title="No shifts this week" description={isMgr ? 'Click any cell to add one.' : 'Your manager hasn\'t published this week yet.'} /></Card>
      )}

      <Modal open={modal.open} onClose={() => setModal({open: false})}
        title={modal.shift ? 'Edit shift' : 'New shift'}
        footer={
          <>
            {modal.shift && <Button variant="danger" onClick={remove}>Delete</Button>}
            <Button variant="ghost" onClick={() => setModal({open: false})}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </>
        }>
        <div className={s.form}>
          <Field label="Date"><Input type="date" value={form.shift_date ?? ''} onChange={e => setForm({...form, shift_date: e.target.value})}/></Field>
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
    </div>
  );
}

function DroppableCell({ id, disabled, onClick, children }: { id: string; disabled?: boolean; onClick?: () => void; children: ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id, disabled });
  return (
    <div ref={setNodeRef} className={`${s.cell} ${isOver ? s.cellOver : ''}`} onClick={onClick}>
      {children}
    </div>
  );
}

function DraggableShift({ id, disabled, children }: { id: string; disabled?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.4 : 1, touchAction: 'none', cursor: disabled ? 'pointer' : 'grab' }}>
      {children}
    </div>
  );
}
