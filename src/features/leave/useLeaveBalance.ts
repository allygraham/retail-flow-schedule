import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';

export interface LeaveBalance {
  entitlement: number;
  taken: number;
  pending: number;
  remaining: number;
  year: number;
}

/** Inclusive day count between two ISO dates (YYYY-MM-DD). */
export function daysBetween(startISO: string, endISO: string): number {
  const start = new Date(startISO + 'T00:00:00');
  const end = new Date(endISO + 'T00:00:00');
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}

/** Clamp a leave range to the given calendar year. Returns inclusive day count or 0. */
export function daysInYear(startISO: string, endISO: string, year: number): number {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const s = startISO < yearStart ? yearStart : startISO;
  const e = endISO > yearEnd ? yearEnd : endISO;
  if (s > e) return 0;
  return daysBetween(s, e);
}

/**
 * Annual leave balance for a single user in the current calendar year.
 * - entitlement: from employee_profiles.annual_leave_entitlement (default 28)
 * - taken: sum of approved annual-leave days in this year
 * - pending: sum of pending annual-leave days in this year (not deducted)
 */
export function useLeaveBalance(userId?: string | null) {
  const { user, business } = useAuth();
  const targetId = userId ?? user?.id ?? null;
  const year = new Date().getFullYear();

  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!targetId || !business) return;
    setLoading(true);
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const [{ data: emp }, { data: leaves }] = await Promise.all([
      supabase
        .from('employee_profiles')
        .select('annual_leave_entitlement')
        .eq('user_id', targetId)
        .eq('business_id', business.id)
        .maybeSingle(),
      supabase
        .from('leave_requests')
        .select('start_date, end_date, status, leave_type')
        .eq('user_id', targetId)
        .eq('business_id', business.id)
        .eq('leave_type', 'annual')
        .in('status', ['approved', 'pending'])
        .lte('start_date', yearEnd)
        .gte('end_date', yearStart),
    ]);

    let taken = 0;
    let pending = 0;
    for (const r of (leaves ?? []) as any[]) {
      const days = daysInYear(r.start_date, r.end_date, year);
      if (r.status === 'approved') taken += days;
      else if (r.status === 'pending') pending += days;
    }
    const entitlement = Number(emp?.annual_leave_entitlement ?? 28);
    setBalance({
      entitlement,
      taken,
      pending,
      remaining: Math.max(0, entitlement - taken),
      year,
    });
    setLoading(false);
  }, [targetId, business, year]);

  useEffect(() => { load(); }, [load]);

  return { balance, loading, reload: load };
}
