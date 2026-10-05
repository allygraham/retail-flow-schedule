import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { useAsyncData } from '@/hooks/useAsyncData';
import { DataLoadError } from '@/components/common/DataLoadError';
import { errorMessage } from '@/lib/errors';
import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/common/Button';
import { Avatar } from '@/components/common/Avatar';
import { fmtDate } from '@/lib/datetime';
import { toast } from 'sonner';
import {
  fetchAffectedShifts,
  suggestReplacements,
  assignReplacement,
  notifyAvailableStaff,
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const actionLock = useRef(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fetchCoverage = useCallback(() => fetchAffectedShifts(businessId, userId, startDate, endDate), [businessId, userId, startDate, endDate]);
  const { data, loading, error, reload: load } = useAsyncData(fetchCoverage, 'Could not load coverage. Please try again.');
  const shifts = data ?? [];
  const selectedShift = shifts.find(shift => shift.id === expanded);
  const fetchCandidates = useCallback(async () => selectedShift ? suggestReplacements(businessId, selectedShift, [userId]) : [], [businessId, userId, selectedShift]);
  const { data: candidates, loading: candLoading, error: candidateError, reload: reloadCandidates } = useAsyncData(fetchCandidates, 'Could not load replacement staff. Please try again.');

  const totalHours = shifts.reduce((acc, sh) => {
    const [sh1, sm1] = sh.start_time.split(':').map(Number);
    const [eh, em] = sh.end_time.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh1 * 60 + sm1) - (sh.break_minutes ?? 0);
    return acc + Math.max(0, mins) / 60;
  }, 0);

  const assign = async (shift: AffectedShift, cand: ReplacementCandidate) => {
    if (actionLock.current) return;
    actionLock.current = true; setMutationError(null);
    setBusy(true);
    try {
      await assignReplacement(businessId, shift, cand.user_id);
      toast.success(`${cand.full_name} assigned to cover`);
      await load();
      onChanged?.();
    } catch (e) { setMutationError(errorMessage(e, 'Could not assign')); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const openAll = async () => {
    if (!shifts.length || actionLock.current) return;
    actionLock.current = true; setMutationError(null);
    setBusy(true);
    try {
      await openShiftsForPickup(businessId, shifts);
      toast.success('Shifts opened for pickup');
      await load();
      onChanged?.();
    } catch (e) { setMutationError(errorMessage(e, 'Could not release shifts')); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const notifyAll = async () => {
    if (!shifts.length || actionLock.current) return;
    actionLock.current = true;
    setNotificationError(null);
    setBusy(true);
    try {
      const result = await notifyAvailableStaff(businessId, shifts, [userId]);
      toast.success(result.sent
        ? `${result.sent} staff notified in the app${result.alreadySent ? ` · ${result.alreadySent} already notified` : ''}`
        : result.alreadySent ? 'Staff have already been notified in the app' : 'No available staff to notify');
    } catch (e) { setNotificationError(errorMessage(e, 'Could not confirm notifications. Retry safely without sending duplicates.')); }
    finally { actionLock.current = false; setBusy(false); }
  };

  if (error) return <div className={s.card}><DataLoadError message={error} retry={load} /></div>;

  if (loading) {
    return <div className={s.card}><div className={s.eyebrow}>Coverage recovery</div><LoadingSkeleton label="Loading affected shifts" /></div>;
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
      {mutationError && <DataLoadError message={mutationError} retry={async () => { setMutationError(null); await load(); }} />}
      {notificationError && <DataLoadError message={notificationError} retry={notifyAll} />}
      <ul className={s.shiftList}>
        {shifts.map(shift => {
          const isOpen = expanded === shift.id;
          const list = candidates;
          return (
            <li key={shift.id} className={s.shift}>
              <button type="button" className={s.shiftHead} onClick={() => setExpanded(isOpen ? null : shift.id)} aria-expanded={isOpen}>
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
                  {candidateError ? <DataLoadError message={candidateError} retry={reloadCandidates} /> : candLoading ? (
                    <LoadingSkeleton label="Loading replacement staff" />
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
