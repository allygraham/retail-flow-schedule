import type { ReactNode } from 'react';
import { Card } from '@/components/common/Card';
import type { LeaveBalance } from './useLeaveBalance';
import s from './LeaveBalanceCard.module.scss';

interface Props {
  balance: LeaveBalance | null;
  loading?: boolean;
  patternMissing?: boolean;
  error?: string | null;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  action?: ReactNode;
}

export function LeaveBalanceCard({ balance, loading, patternMissing, error, title = 'Annual leave', subtitle, compact, action }: Props) {
  const sub = subtitle ?? (balance ? `${balance.year} entitlement` : undefined);
  return (
    <Card title={title} subtitle={sub}>
      {loading ? (
        <div className={s.loading}>Loading…</div>
      ) : error || patternMissing || !balance ? (
        <div className={s.loading} role="status">{error ?? (patternMissing
          ? 'Your manager needs to set your normal working days in Team before your annual leave balance can be calculated.'
          : 'Annual leave balance is unavailable.')}</div>
      ) : (
        <div className={`${s.wrap} ${compact ? s.compact : ''}`}>
          <div className={s.stats}>
            <Stat label={balance.remaining < 0 ? 'Over entitlement' : 'Remaining'} value={`${Math.abs(balance.remaining)} days`} accent />
            <Stat label="Taken" value={`${balance.taken} days\n`} />
            <Stat label="Entitlement" value={`${balance.entitlement} days`} muted />
          </div>
          <Bar entitlement={balance.entitlement} taken={balance.taken} pending={balance.pending} />
          <div className={s.legend}>
             <span><i className={s.dotTaken} /> {balance.taken} taken</span>
             {balance.pending > 0 && <span><i className={s.dotPending} /> {balance.pending} pending</span>}
          </div>
          {action && <div className={s.actionRow}>{action}</div>}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className={`${s.stat} ${accent ? s.accent : ''} ${muted ? s.muted : ''}`}>
      <div className={s.statValue}>{value}</div>
      <div className={s.statLabel}>{label}</div>
    </div>
  );
}

function Bar({ entitlement, taken, pending }: { entitlement: number; taken: number; pending: number }) {
  const total = Math.max(entitlement, taken + pending, 1);
  const takenPct = (taken / total) * 100;
  const pendingPct = (pending / total) * 100;
  return (
    <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={entitlement} aria-valuenow={Math.min(taken, Math.max(entitlement, 0))} aria-valuetext={`${taken} days taken of ${entitlement} days entitlement`}>
      <div className={s.barTaken} style={{ width: `${takenPct}%` }} />
      <div className={s.barPending} style={{ width: `${pendingPct}%` }} />
    </div>
  );
}
