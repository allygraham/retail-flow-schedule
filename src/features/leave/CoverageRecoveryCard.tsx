import { errorMessage } from '@/lib/errors';
import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/common/Button';
import { Avatar } from '@/components/common/Avatar';
import { fmtDate } from '@/lib/datetime';
import { toast } from 'sonner';
import {
  fetchAffectedShifts,
  suggestReplacements,
  assignReplacement,
  notifyCandidatesOfOpenShifts,
  openShiftsForPickup,
  type AffectedShift,
  type ReplacementCandidate,
} from './coverage';
import s from './CoverageRecoveryCard.module.scss';

interface Props {
  businessId: string;
  userId: string;
  startDate: string;
  endDate: string;
  onChanged?: () => void;
}

/**
 * "Someone called in sick — what now?" operational workflow.
 * Lists affected shifts and surfaces lightweight recovery actions:
 *   • Open shifts for pickup (mark unassigned).
 *   • Suggest replacements ranked by store/role/availability.
 *   • Quick-assign a candidate.
 *   • Notify available staff.
 */
export function CoverageRecoveryCard({ businessId, userId, startDate, endDate, onChanged }: Props) {
  const [shifts, setShifts] = useState<AffectedShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Record<string, ReplacementCandidate[]>>({});
  const [candLoading, setCandLoading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAffectedShifts(businessId, userId, startDate, endDate);
      setShifts(rows);
    } finally {
      setLoading(false);
    }
  }, [businessId, userId, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const totalHours = shifts.reduce((acc, sh) => {
    const [sh1, sm1] = sh.start_time.split(':').map(Number);
    const [eh, em] = sh.end_time.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh1 * 60 + sm1) - (sh.break_minutes ?? 0);
    return acc + Math.max(0, mins) / 60;
  }, 0);

  const toggleShift = async (shift: AffectedShift) => {
    const isOpen = expanded === shift.id;
    setExpanded(isOpen ? null : shift.id);
    if (!isOpen && !candidates[shift.id]) {
      setCandLoading(shift.id);
      try {
        const list = await suggestReplacements(businessId, shift, [userId]);
        setCandidates(prev => ({ ...prev, [shift.id]: list }));
      } catch (e) {
        toast.error(errorMessage(e, 'Could not load suggestions'));
      } finally {
        setCandLoading(null);
      }
    }
  };

  const assign = async (shift: AffectedShift, cand: ReplacementCandidate) => {
    setBusy(true);
    try {
      await assignReplacement(shift.id, cand.user_id);
      toast.success(`${cand.full_name} assigned to cover`);
      await load();
      onChanged?.();
    } catch (e) { toast.error(errorMessage(e, 'Could not assign')); }
    finally { setBusy(false); }
  };

  const openAll = async () => {
    if (!shifts.length) return;
    setBusy(true);
    try {
      await openShiftsForPickup(shifts.map(s => s.id));
      toast.success('Shifts opened for pickup');
      await load();
      onChanged?.();
    } catch (e) { toast.error(errorMessage(e, 'Could not release shifts')); }
    finally { setBusy(false); }
  };

  const notifyAll = async () => {
    if (!shifts.length) return;
    setBusy(true);
    try {
      const pool = await suggestReplacements(businessId, shifts[0], [userId]);
      const sent = await notifyCandidatesOfOpenShifts(businessId, pool, shifts);
      toast.success(`Notified ${sent} available staff`);
    } catch (e) { toast.error(errorMessage(e, 'Could not send notifications')); }
    finally { setBusy(false); }
  };

  if (loading) {
    return <div className={s.card}><div className={s.eyebrow}>Coverage recovery</div><div className={s.line}>Checking affected shifts…</div></div>;
  }

  if (shifts.length === 0) {
    return (
      <div className={s.card}>
        <div className={s.eyebrow}>Coverage recovery</div>
        <div className={s.line}>No assigned shifts in this period — nothing to recover.</div>
      </div>
    );
  }

  return (
    <div className={s.card}>
      <header className={s.header}>
        <div>
          <div className={s.eyebrow}>Coverage recovery</div>
          <div className={s.heading}>
            {shifts.length} shift{shifts.length === 1 ? '' : 's'} need cover · {totalHours.toFixed(1)}h
          </div>
        </div>
        <div className={s.headerActions}>
          <Button size="sm" variant="outline" onClick={openAll} disabled={busy}>Open for pickup</Button>
          <Button size="sm" onClick={notifyAll} disabled={busy}>Notify available staff</Button>
        </div>
      </header>
      <ul className={s.shiftList}>
        {shifts.map(shift => {
          const isOpen = expanded === shift.id;
          const list = candidates[shift.id];
          return (
            <li key={shift.id} className={s.shift}>
              <button type="button" className={s.shiftHead} onClick={() => toggleShift(shift)} aria-expanded={isOpen}>
                <div className={s.shiftMeta}>
                  <strong>{fmtDate(shift.shift_date, 'EEE d MMM')}</strong>
                  <span className={s.muted}>· {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}</span>
                  {shift.store_name && <span className={s.muted}>· {shift.store_name}</span>}
                  {shift.role_name && <span className={s.tag}>{shift.role_name}</span>}
                </div>
                <span className={s.cta}>{isOpen ? 'Hide' : 'Suggest replacements'}</span>
              </button>
              {isOpen && (
                <div className={s.suggestions}>
                  {candLoading === shift.id ? (
                    <div className={s.line}>Finding candidates…</div>
                  ) : list && list.length ? (
                    <ul className={s.candidates}>
                      {list.map(cand => (
                        <li key={cand.user_id} className={s.candidate}>
                          <Avatar name={cand.full_name} size="sm" />
                          <div className={s.candidateBody}>
                            <span className={s.candName}>{cand.full_name}</span>
                            <span className={s.muted}>{cand.reason}</span>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => assign(shift, cand)} disabled={busy}>Assign</Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className={s.line}>No matching staff are available for this shift.</div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
