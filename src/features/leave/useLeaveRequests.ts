import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import type { LeaveRequest, LeaveStatus } from '@/types/domain';

export interface LeaveRequestRow extends LeaveRequest {
  profiles?: { full_name: string | null } | null;
  primary_store?: { name: string | null } | null;
}

interface ReviewInput {
  id: string;
  status: Extract<LeaveStatus, 'approved' | 'rejected'>;
  review_notes?: string | null;
}

/**
 * Single source of truth for leave requests in the current business.
 * - Managers/owners see every request.
 * - Employees see only their own.
 * - On approval, unassigns any of the requester's shifts that fall in the date range.
 */
export function useLeaveRequests() {
  const { business, role, user } = useAuth();
  const isMgr = role === 'owner' || role === 'manager';
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!business || !user) return;
    setLoading(true);
    setError(null);
    let q = supabase
      .from('leave_requests')
      .select('*, profiles!leave_requests_user_id_fkey(full_name)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });
    if (!isMgr) q = q.eq('user_id', user.id);
    const { data, error } = await q;
    if (error) { setError(error.message); setLoading(false); return; }

    // Hydrate primary store name for manager view (one extra small query)
    let rows = (data ?? []) as LeaveRequestRow[];
    if (isMgr && rows.length) {
      const userIds = Array.from(new Set(rows.map(r => r.user_id)));
      const { data: emp } = await supabase
        .from('employee_profiles')
        .select('user_id, primary_store_id, store_locations:primary_store_id(name)')
        .eq('business_id', business.id)
        .in('user_id', userIds);
      const storeByUser: Record<string, { name: string | null } | null> = {};
      for (const e of (emp ?? []) as any[]) {
        storeByUser[e.user_id] = e.store_locations ?? null;
      }
      rows = rows.map(r => ({ ...r, primary_store: storeByUser[r.user_id] ?? null }));
    }
    setRequests(rows);
    setLoading(false);
  }, [business, user, isMgr]);

  useEffect(() => { load(); }, [load]);

  const submit = useCallback(async (input: {
    leave_type: 'annual' | 'unpaid' | 'sick' | 'other';
    start_date: string;
    end_date: string;
    reason?: string | null;
  }) => {
    if (!business || !user) throw new Error('Not ready');
    const { error } = await supabase.from('leave_requests').insert({
      ...input,
      business_id: business.id,
      user_id: user.id,
    } as any);
    if (error) throw error;
    await load();
  }, [business, user, load]);

  const cancelOwn = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('leave_requests')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (error) throw error;
    await load();
  }, [load]);

  const review = useCallback(async ({ id, status, review_notes }: ReviewInput) => {
    if (!user) throw new Error('Not authenticated');
    const target = requests.find(r => r.id === id);
    const { error } = await supabase
      .from('leave_requests')
      .update({
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: review_notes ?? null,
      })
      .eq('id', id);
    if (error) throw error;

    // On approval: unassign any of the employee's shifts inside the leave range.
    if (status === 'approved' && target) {
      await supabase
        .from('shifts')
        .update({ assigned_user_id: null, status: 'unassigned' })
        .eq('business_id', target.business_id)
        .eq('assigned_user_id', target.user_id)
        .gte('shift_date', target.start_date)
        .lte('shift_date', target.end_date);
    }
    await load();
  }, [user, requests, load]);

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return { requests, loading, error, isMgr, pendingCount, load, submit, cancelOwn, review };
}
