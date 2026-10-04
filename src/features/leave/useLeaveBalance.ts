import { useCallback, useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculateLeaveDays } from './leaveDays';
import { useAuth } from '@/features/auth/authContext';
export { daysBetween, daysInYear } from './leaveDays';

export interface LeaveBalance {
  entitlement: number;
  taken: number;
  pending: number;
  remaining: number;
  year: number;
}

/**
 * Annual leave balance for a single user in the current calendar year.
 * - entitlement: from employee_profiles.annual_leave_entitlement (default 28)
 * - taken: distinct approved working dates in this year
 * - pending: distinct pending working dates, excluding already approved dates (not deducted)
 */
export function useLeaveBalance(userId?: string | null) {
  const { user, business } = useAuth();
  const targetId = userId ?? user?.id ?? null;
  const year = new Date().getFullYear();

  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingDays, setWorkingDays] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patternMissing, setPatternMissing] = useState(false);

  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    if (!targetId || !business) {
      setBalance(null); setWorkingDays(null); setPatternMissing(false); setError(null); setLoading(false);
      return;
    }
    setLoading(true);
    setBalance(null); setWorkingDays(null); setPatternMissing(false); setError(null);
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    try {
      const [{ data: emp, error: profileError }, { data: leaves, error: leaveError }] = await Promise.all([
        supabase
          .from('employee_profiles')
          .select('annual_leave_entitlement, working_days')
          .eq('user_id', targetId)
          .eq('business_id', business.id)
          .maybeSingle(),
        supabase
          .from('leave_requests')
          .select('start_date, end_date, status, leave_type, charged_working_days')
          .eq('user_id', targetId)
          .eq('business_id', business.id)
          .eq('leave_type', 'annual')
          .in('status', ['approved', 'pending'])
          .lte('start_date', yearEnd)
          .gte('end_date', yearStart),
      ]);

      if (request !== sequence.current) return;
      if (profileError || leaveError) {
        setError('Could not load annual leave balance. Please try again.');
        return;
      }
      const pattern = emp?.working_days ?? null;
      setWorkingDays(pattern);
      if (!pattern?.length || (leaves ?? []).some(l => l.status === 'approved' && !l.charged_working_days?.length)) {
        setPatternMissing(true); return;
      }
      const { taken, pending } = calculateLeaveDays(leaves ?? [], year, pattern);
      const entitlement = Number(emp?.annual_leave_entitlement ?? 28);
      setBalance({
        entitlement,
        taken,
        pending,
        remaining: entitlement - taken,
        year,
      });
    } catch {
      if (request === sequence.current) setError('Could not load annual leave balance. Please try again.');
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [targetId, business, year]);

  useEffect(() => { const requests = sequence; void load(); return () => { requests.current++; }; }, [load]);

  return { balance, workingDays, patternMissing, error, loading, reload: load };
}
