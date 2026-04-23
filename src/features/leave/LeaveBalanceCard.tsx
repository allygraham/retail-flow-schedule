import { Card } from '@/components/common/Card';
import type { LeaveBalance } from './useLeaveBalance';
import s from './LeaveBalanceCard.module.scss';

interface Props {
  balance: LeaveBalance | null;
  loading?: boolean;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

export function LeaveBalanceCard({ balance, loading, title = 'Annual leave', subtitle, compact }: Props) {
  const sub = subtitle ?? (balance ? `${balance.year} entitlement` : undefined);
  return (
    <Card title={title} subtitle={sub}>
      {loading || !balance ? (
        <div className={s.loading}>Loading…</div>
      ) : (
        <div className={`${s.wrap} ${compact ? s.compact : ''}`}>
          <div className={s.stats}>
            <Stat label="Remaining" value={`${balance.remaining} days remaining`} accent />
            <Stat label="Taken" value={`${balance.taken} days taken`} />
            <Stat label="Entitlement" value={`${balance.entitlement} days entitlement`} muted />
          </div>
          <Bar entitlement={balance.entitlement} taken={balance.taken} pending={balance.pending} />
          <div className={s.legend}>
            <span><i className={s.dotTaken} /> {balance.taken} day{balance.taken === 1 ? '' : 's'} taken</span>
            {balance.pending > 0 && <span><i className={s.dotPending} /> Pending {balance.pending}</span>}
            <span className={s.legendMuted}>{balance.remaining} day{balance.remaining === 1 ? '' : 's'} remaining</span>
          </div>
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
    <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={entitlement} aria-valuenow={taken}>
      <div className={s.barTaken} style={{ width: `${takenPct}%` }} />
      <div className={s.barPending} style={{ width: `${pendingPct}%` }} />
    </div>
  );
}
