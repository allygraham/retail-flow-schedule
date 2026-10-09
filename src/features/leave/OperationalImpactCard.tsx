import { useAsyncData } from '@/hooks/useAsyncData';
import { assertQueryResults } from '@/lib/queryResults';
import { DataLoadError } from '@/components/common/DataLoadError';
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/authContext';
import { daysBetween } from './useLeaveBalance';
import s from './OperationalImpact.module.scss';

interface Props {
  embedded?: boolean;
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
export function OperationalImpactCard({ userId, startDate, endDate, embedded = false }: Props) {
  const { business } = useAuth();
  const fetchImpact = useCallback(async (): Promise<Impact | null> => {
    if (!business || !userId || !startDate || !endDate || endDate < startDate) return null;
    const result = await supabase.from('shifts')
      .select('start_time, end_time, break_minutes')
      .eq('business_id', business.id).eq('assigned_user_id', userId)
      .neq('status', 'cancelled').gte('shift_date', startDate).lte('shift_date', endDate);
    assertQueryResults(result);
    const rows = result.data ?? [];
    const mins = rows.reduce((total, row) => {
      const [sh, sm] = row.start_time.split(':').map(Number);
      const [eh, em] = row.end_time.split(':').map(Number);
      return total + Math.max(0, eh * 60 + em - sh * 60 - sm - (row.break_minutes ?? 0));
    }, 0);
    return { shiftCount: rows.length, uncoveredHours: Math.round(mins / 6) / 10 };
  }, [business, userId, startDate, endDate]);
  const { data: impact, loading, error, reload } = useAsyncData(fetchImpact, 'Could not calculate coverage. Please try again.');

  const days = daysBetween(startDate, endDate);

  return (
    <div className={`${s.card} ${embedded ? s.embedded : ''}`} role="status" aria-live="polite">
      {!embedded && <div className={s.eyebrow}>Operational impact</div>}
      {error ? <DataLoadError message={error} retry={reload} /> : loading ? (
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
