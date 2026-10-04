import { daysInYear } from './leaveDays';
import { useLeaveBalance } from './useLeaveBalance';
import s from './LeaveBalanceInline.module.scss';

interface Props {
  userId: string;
  startDate?: string;
  endDate?: string;
}

/** Compact one-line balance summary, used inside review modal etc. */
export function LeaveBalanceInline({ userId, startDate, endDate }: Props) {
  const { balance, workingDays, patternMissing, error, loading } = useLeaveBalance(userId);
  if (loading) return <div className={s.row}><span className={s.label}>Annual leave</span><span className={s.muted}>Loading…</span></div>;
  if (error || patternMissing) return <div className={s.row} role="status">{error ?? 'Set this employee’s normal working days in Team to calculate their leave balance.'}</div>;
  if (!balance || !workingDays) return null;
  const pendingDays = startDate && endDate ? daysInYear(startDate, endDate, balance.year, workingDays) : undefined;
  const after = pendingDays != null ? Math.max(0, balance.remaining - pendingDays) : null;
  const wouldExceed = pendingDays != null && pendingDays > balance.remaining;
  return (
    <div className={s.row}>
      <span className={s.label}>Annual leave {balance.year}</span>
      <span className={s.value}>
        <strong>{balance.remaining}</strong> remaining
        <span className={s.sep}>·</span>
        {balance.taken} taken
        <span className={s.sep}>·</span>
        {balance.entitlement} entitlement
      </span>
      {after !== null && (
        <span className={`${s.after} ${wouldExceed ? s.warn : ''}`}>
          {wouldExceed
            ? `Exceeds balance by ${pendingDays! - balance.remaining} day${(pendingDays! - balance.remaining) === 1 ? '' : 's'}`
            : `${after} left after approval`}
        </span>
      )}
    </div>
  );
}
