import { Link } from 'react-router-dom';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, HeartPulse, Plus } from 'lucide-react';
import { Avatar } from '@/components/common/Avatar';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { fmtDate, fmtTime, hoursBetween, isoDate, inRange } from '@/lib/datetime';
import type { RotaPerson, ShiftRow } from '@/types/rows';
import { TYPE_LABEL } from '@/features/leave/leaveStatus';
import s from './MobileRota.module.scss';

type Absence = { id: string; user_id: string; start_date: string; end_date: string; leave_type: string; status: string };
interface Props {
  days: Date[]; people: RotaPerson[]; shifts: ShiftRow[]; leave: Absence[]; manager: boolean;
  gridRef: RefObject<HTMLDivElement>; minHeight: number;
  loading: boolean; hours: Record<string, number>; context: string;
  confirmed: (person: RotaPerson) => boolean;
  holiday: (date: string) => string | undefined;
  roleName: (id: string | null) => string | undefined;
  storeName: (id: string) => string | undefined; multipleStores: boolean;
  onEdit: (shift: ShiftRow) => void; onCreate: (date: string, person?: string) => void;
  onAbsence: (id: string, opener: HTMLButtonElement) => void;
  conflicts: (shift: ShiftRow) => string[];
}

export default function MobileRota(props: Props) {
  const { days, people, shifts, leave, manager, loading, hours, context } = props;
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selection, setSelection] = useState<{ id: string; context: string } | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const dayNodes = useRef<Record<string, HTMLLIElement | null>>({});
  const dayHeights = useRef<Record<string, number>>({});
  useLayoutEffect(() => {
    if (!loading) for (const [key, node] of Object.entries(dayNodes.current)) if (node) dayHeights.current[key] = node.getBoundingClientRect().height;
  }, [loading, shifts, leave, expanded]);
  const selected = selection?.context === context && !loading ? shifts.find(shift => shift.id === selection.id) : undefined;
  const personShifts = (id: string, date: string) => shifts.filter(shift => shift.assigned_user_id === id && shift.shift_date === date);
  const absences = (id: string, date: string) => leave.filter(row => row.user_id === id && row.status === 'approved' && inRange(date, row.start_date, row.end_date));
  const labelFor = (type: string) => TYPE_LABEL[type as keyof typeof TYPE_LABEL] ?? 'Other absence';
  const renderShift = (shift: ShiftRow) => <button type="button" key={shift.id} data-shift-id={shift.id} disabled={loading}
    className={`${s.shift} ${shift.status === 'cancelled' ? s.cancelled : ''}`}
    aria-label={`${manager ? 'Edit' : 'View'} shift ${fmtTime(shift.start_time)}–${fmtTime(shift.end_time)}`}
    onClick={event => { if (manager) props.onEdit(shift); else { opener.current = event.currentTarget; setSelection({ id: shift.id, context }); } }}>
    <span className={s.shiftMain}><strong>{fmtTime(shift.start_time)}–{fmtTime(shift.end_time)}</strong>
      <span>{props.roleName(shift.role_id) ?? 'Shift'}{props.multipleStores ? ` · ${props.storeName(shift.store_id) ?? 'Store'}` : ''}</span>
      <span>{hoursBetween(shift.start_time, shift.end_time, shift.break_minutes ?? 0)}h excluding breaks</span>
      <span className={s.badges}>{shift.status === 'cancelled' ? <Badge tone="neutral">Cancelled</Badge> : !shift.is_published ? <Badge tone="warning">Draft</Badge> : null}
        {props.conflicts(shift).map(conflict => <Badge key={conflict} tone="danger">{conflict}</Badge>)}</span>
    </span><ChevronRight size={18} aria-hidden />
  </button>;
  const agenda = (person: RotaPerson) => <ol className={s.agenda} aria-label={`${person.name} full week`}>
    {days.map(day => {
      const date = isoDate(day), records = personShifts(person.user_id, date), approved = absences(person.user_id, date);
      const active = records.filter(shift => shift.status !== 'cancelled');
      const holiday = props.holiday(date);
      const dayKey = `${person.user_id}:${day.getDay()}`;
      return <li key={date} ref={node => { dayNodes.current[dayKey] = node; }} style={{ minHeight: loading ? dayHeights.current[dayKey] : undefined }} className={s.day} data-mobile-day={date} data-rota-cell={`${person.user_id}|${date}`}>
        <time dateTime={date} className={s.date}><span>{fmtDate(day, 'EEE')}</span><strong>{fmtDate(day, 'd')}</strong></time>
        <div className={s.dayBody}>
          {holiday && <span className={s.holiday}>{holiday}</span>}
          {loading ? <span className={s.skeleton} aria-label="Loading day" /> : <>
            {approved.map(row => <button type="button" key={row.id} className={`${s.absence} ${row.leave_type === 'sick' ? s.sick : ''}`}
              aria-label={`View ${row.leave_type === 'sick' ? 'sickness' : 'leave'} details for ${person.name}`}
              onClick={event => props.onAbsence(row.id, event.currentTarget)}>
              {row.leave_type === 'sick' ? <HeartPulse size={18} aria-hidden /> : <CalendarDays size={18} aria-hidden />}
              <span>{labelFor(row.leave_type)}</span><ChevronRight size={18} aria-hidden />
            </button>)}
            {records.map(renderShift)}
            {!active.length && !approved.length && <div className={s.emptyDay}><span>{props.confirmed(person) ? 'Day off' : 'To be confirmed'}</span>
              {manager && <button type="button" onClick={() => props.onCreate(date, person.user_id)} aria-label={`Add shift for ${person.name} on ${fmtDate(day, 'EEEE d MMM')}`}><Plus size={15} aria-hidden />Add shift</button>}
            </div>}
            {manager && active.length > 0 && approved.length === 0 && <button type="button" className={s.addAnother} onClick={() => props.onCreate(date, person.user_id)} aria-label={`Add another shift for ${person.name} on ${fmtDate(day, 'EEEE d MMM')}`}>Add another shift</button>}
          </>}
        </div>
      </li>;
    })}
  </ol>;
  const openShifts = shifts.filter(shift => !shift.assigned_user_id && shift.status !== 'cancelled');
  return <div ref={props.gridRef} style={{ minHeight: loading ? props.minHeight : undefined }} className={s.root} aria-label="Weekly rota" aria-busy={loading}>
    {manager && loading && people.length === 0 && [0, 1, 2].map(index => <div key={index} className={s.card} aria-hidden="true">
      <div className={s.person}><span className={s.avatarSkeleton} /><span className={s.nameSkeleton} /><span className={s.hoursSkeleton} /></div>
      <div className={s.summary}>{days.map(day => <div key={isoDate(day)} className={s.summarySkeleton}><span className={s.miniSkeleton} /><span className={s.miniSkeleton} /></div>)}</div>
    </div>)}
    {!manager && people.map(person => <section key={person.user_id} className={s.staffWeek} aria-label="My week">
      <div className={s.weekHeading}><h2>My week</h2><span>{loading ? <span className={s.hoursSkeleton} /> : `${hours[person.user_id] ?? 0} scheduled hours`}</span></div>
      <div className={s.card}>{agenda(person)}</div>
    </section>)}
    {manager && people.map(person => {
      const open = expanded.includes(person.user_id), detailsId = `mobile-week-${person.user_id}`;
      return <section key={person.user_id} className={s.card} aria-label={`${person.name} week overview`}>
        <button type="button" className={s.person} aria-label={`${open ? 'Collapse' : 'Expand'} week for ${person.name}`} aria-expanded={open} aria-controls={detailsId}
          onClick={() => setExpanded(current => open ? current.filter(id => id !== person.user_id) : [...current, person.user_id])}>
          <Avatar name={person.name} /><span className={s.name}>{person.name}</span>
          <span className={s.hours} aria-label={`${person.name} weekly hours`}>{loading ? <span className={s.hoursSkeleton} /> : `${hours[person.user_id] ?? 0}h`}</span>
          <ChevronDown className={open ? s.expanded : ''} size={18} aria-hidden />
        </button>
        <ol className={s.summary} aria-label={`${person.name} week summary`}>
          {days.map(day => {
            const date = isoDate(day), records = personShifts(person.user_id, date).filter(shift => shift.status !== 'cancelled'), approved = absences(person.user_id, date);
            const statuses = [...new Set([...(records.length ? [records.length > 1 ? `${records.length} shifts` : 'Work'] : []), ...approved.map(row => row.leave_type === 'sick' ? 'Sick' : row.leave_type === 'annual' ? 'Leave' : 'Away')])];
            if (!statuses.length) statuses.push(props.confirmed(person) ? 'Off' : 'TBC');
            return <li key={date}><time dateTime={date}><span>{fmtDate(day, 'EEE')}</span><span>{fmtDate(day, 'd')}</span></time>
              {loading ? <span className={s.miniSkeleton} aria-label="Loading day" /> : <span className={s.statuses}>
                {statuses.map(status => <span key={status} className={`${s.status} ${status === 'Sick' ? s.sickStatus : status === 'Leave' || status === 'Away' ? s.leaveStatus : status === 'Work' || status.includes('shifts') ? s.workStatus : ''}`}>{status}</span>)}
                {records.some(shift => !shift.is_published) && <span className={s.draftStatus}>Draft</span>}
                {records.some(shift => props.conflicts(shift).length) && <span className={s.conflictStatus}>Conflict</span>}
              </span>}
            </li>;
          })}
        </ol>
        <div id={detailsId} hidden={!open}>{open && agenda(person)}</div>
      </section>;
    })}
    {manager && <section className={`${s.card} ${openShifts.length && !loading ? s.unassigned : ''}`} aria-label="Unassigned shifts">
      <div className={s.openHeading}><h2>Unassigned shifts</h2><span>{loading ? <span className={s.hoursSkeleton} /> : `${openShifts.length} need cover`}</span></div>
      {loading ? <div className={s.skeleton} /> : openShifts.map(shift => <div key={shift.id} className={s.openShift}><span>{fmtDate(shift.shift_date, 'EEE d MMM')}</span>{renderShift(shift)}</div>)}
      <button type="button" className={s.addOpen} disabled={loading} onClick={() => props.onCreate(isoDate(days[0]))}><Plus size={16} aria-hidden />Add unassigned shift</button>
    </section>}
    <Modal open={!!selected} onClose={() => setSelection(null)} title="Shift details" returnFocusTo={opener.current}>
      {selected && <div className={s.detail}><strong>{fmtDate(selected.shift_date, 'EEEE d MMM yyyy')}</strong>
        <p>{fmtTime(selected.start_time)}–{fmtTime(selected.end_time)}</p>
        <p>{props.roleName(selected.role_id) ?? 'Shift'} · {props.storeName(selected.store_id) ?? 'Store'}</p>
        <p>{hoursBetween(selected.start_time, selected.end_time, selected.break_minutes ?? 0)} scheduled hours · {selected.break_minutes ?? 0} minute break</p>
        {selected.status === 'cancelled' && <Badge tone="neutral">Cancelled</Badge>}
        {selected.notes && <p>{selected.notes}</p>}
        {selected.status !== 'cancelled' && <Link to={`/shift-changes?shift=${selected.id}`}>Request a shift change</Link>}
      </div>}
    </Modal>
  </div>;
}
