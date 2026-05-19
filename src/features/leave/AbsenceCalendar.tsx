import { useMemo, useState } from 'react';
import type { LeaveRequestRow } from './useLeaveRequests';
import { TYPE_LABEL } from './leaveStatus';
import { fmtDate } from '@/lib/datetime';
import s from './AbsenceCalendar.module.scss';

interface Props {
  requests: LeaveRequestRow[];
  onSelectRequest?: (r: LeaveRequestRow) => void;
}

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function isoOf(d: Date) { return d.toISOString().slice(0, 10); }

/**
 * Monthly absence overview. Shows annual leave vs sickness separately.
 * Subtle, scannable, click-day-to-inspect.
 */
export function AbsenceCalendar({ requests, onSelectRequest }: Props) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string | null>(null);

  const activeRequests = useMemo(
    () => requests.filter(r => r.status === 'approved' || r.status === 'pending'),
    [requests],
  );

  const monthStart = cursor;
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  // Grid: Mon-first weeks
  const firstWeekday = (monthStart.getDay() + 6) % 7; // 0=Mon
  const totalCells = Math.ceil((firstWeekday + monthEnd.getDate()) / 7) * 7;
  const cells: Array<{ date: Date; iso: string; inMonth: boolean }> = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(monthStart);
    d.setDate(d.getDate() - firstWeekday + i);
    cells.push({ date: d, iso: isoOf(d), inMonth: d.getMonth() === monthStart.getMonth() });
  }

  const byDay = useMemo(() => {
    const map = new Map<string, LeaveRequestRow[]>();
    for (const r of activeRequests) {
      const a = new Date(r.start_date + 'T00:00:00');
      const b = new Date(r.end_date + 'T00:00:00');
      const cur = new Date(a);
      while (cur <= b) {
        const k = isoOf(cur);
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(r);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [activeRequests]);

  const selectedItems = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className={s.wrap}>
      <div className={s.toolbar}>
        <button type="button" className={s.navBtn} onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month">‹</button>
        <div className={s.monthLabel}>{fmtDate(isoOf(cursor), 'MMMM yyyy')}</div>
        <button type="button" className={s.navBtn} onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">›</button>
        <div className={s.legend}>
          <span className={`${s.dot} ${s.leave}`} /> Annual leave
          <span className={`${s.dot} ${s.sick}`} /> Sickness
          <span className={`${s.dot} ${s.other}`} /> Other
        </div>
      </div>
      <div className={s.weekHead}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className={s.grid}>
        {cells.map(({ date, iso, inMonth }) => {
          const items = byDay.get(iso) ?? [];
          const annual = items.some(i => i.leave_type === 'annual' || i.leave_type === 'unpaid');
          const sick = items.some(i => i.leave_type === 'sick');
          const other = items.some(i => i.leave_type === 'other');
          const isToday = iso === isoOf(new Date());
          return (
            <button
              key={iso}
              type="button"
              className={`${s.cell} ${inMonth ? '' : s.outMonth} ${isToday ? s.today : ''} ${selected === iso ? s.selected : ''}`}
              onClick={() => setSelected(iso)}
            >
              <span className={s.dayNum}>{date.getDate()}</span>
              <span className={s.dots}>
                {annual && <span className={`${s.dot} ${s.leave}`} />}
                {sick && <span className={`${s.dot} ${s.sick}`} />}
                {other && <span className={`${s.dot} ${s.other}`} />}
              </span>
              {items.length > 1 && <span className={s.count}>{items.length}</span>}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className={s.dayPanel}>
          <div className={s.dayHead}>
            <strong>{fmtDate(selected, 'EEEE d MMM yyyy')}</strong>
            <span className={s.muted}>{selectedItems.length} absence{selectedItems.length === 1 ? '' : 's'}</span>
          </div>
          {selectedItems.length === 0 ? (
            <div className={s.muted}>No absences on this day.</div>
          ) : (
            <ul className={s.dayList}>
              {selectedItems.map(item => (
                <li key={item.id}>
                  <button type="button" className={s.dayItem} onClick={() => onSelectRequest?.(item)}>
                    <span className={`${s.dot} ${item.leave_type === 'sick' ? s.sick : item.leave_type === 'other' ? s.other : s.leave}`} />
                    <span className={s.name}>{item.profiles?.full_name ?? 'Employee'}</span>
                    <span className={s.muted}>{TYPE_LABEL[item.leave_type]}</span>
                    <span className={s.muted}>{fmtDate(item.start_date, 'd MMM')} → {fmtDate(item.end_date, 'd MMM')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
