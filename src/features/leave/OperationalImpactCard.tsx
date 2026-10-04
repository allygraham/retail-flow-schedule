import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/authContext';
import { daysBetween } from './useLeaveBalance';
import s from './OperationalImpact.module.scss';

interface Props {
  userId: string;
  startDate: string;
  endDate: string;
  /** Triggered when inputs change so we lazily fetch coverage stats. */
  pendingShown?: boolean;
}

interface Impact {
  shiftCount: number;
  uncoveredHours: number;
}

/**
 * Lightweight, informational summary of operational fallout from leave.
 * Lists affected shift count + uncovered hours and reminds the manager that
 * shifts are returned to open coverage. Non-alarming styling.
 */
export function OperationalImpactCard({ userId, startDate, endDate }: Props) {
  const { business } = useAuth();
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!business || !userId || !startDate || !endDate || endDate < startDate) {
        setImpact(null); return;
      }
      setLoading(true);
      const { data } = await supabase
        .from('shifts')
        .select('start_time, end_time, break_minutes')
        .eq('business_id', business.id)
        .eq('assigned_user_id', userId)
        .gte('shift_date', startDate)
        .lte('shift_date', endDate);
      if (cancelled) return;
      const rows = data ?? [];
      let mins = 0;
      for (const r of rows) {
        const [sh, sm] = String(r.start_time).split(':').map(Number);
        const [eh, em] = String(r.end_time).split(':').map(Number);
        const dur = (eh * 60 + em) - (sh * 60 + sm) - (r.break_minutes ?? 0);
        if (dur > 0) mins += dur;
      }
      setImpact({ shiftCount: rows.length, uncoveredHours: Math.round((mins / 60) * 10) / 10 });
      setLoading(false);
    }
    run();
    return () => { cancelled = true; };
  }, [business, userId, startDate, endDate]);

  const days = daysBetween(startDate, endDate);

  return (
    <div className={s.card} role="status" aria-live="polite">
      <div className={s.eyebrow}>Operational impact</div>
      {loading ? (
        <div className={s.line}>Calculating cover…</div>
      ) : (
        <ul className={s.list}>
          <li>{impact?.shiftCount ?? 0} shift{(impact?.shiftCount ?? 0) === 1 ? '' : 's'} affected across {days} day{days === 1 ? '' : 's'}</li>
          <li>{impact?.uncoveredHours ?? 0} uncovered hour{(impact?.uncoveredHours ?? 0) === 1 ? '' : 's'}</li>
          <li>Existing shifts will be returned to open coverage</li>
        </ul>
      )}
    </div>
  );
}
