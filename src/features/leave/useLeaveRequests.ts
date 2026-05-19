import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import type { LeaveRequest, LeaveStatus } from '@/types/domain';
import type { SicknessMeta, SicknessLifecycleStatus } from './sickness';

export interface LeaveRequestRow extends LeaveRequest {
  profiles?: { full_name: string | null } | null;
  primary_store?: { name: string | null } | null;
  sickness_meta?: SicknessMeta | null;
  lifecycle_status?: SicknessLifecycleStatus | null;
}

interface ReviewInput {
  id: string;
  status: Extract<LeaveStatus, 'approved' | 'rejected'>;
  review_notes?: string | null;
}

interface ManagementLeaveInput {
  user_id: string;
  leave_type: 'annual' | 'unpaid' | 'sick';
  start_date: string;
  end_date: string;
  reason?: string | null;
  manager_note?: string | null;
  status?: 'approved';
  sickness_meta?: SicknessMeta | null;
  lifecycle_status?: SicknessLifecycleStatus | null;
}

/**
 * Single source of truth for leave requests in the current business.
 * - Managers/owners see every request.
 * - Employees see only their own.
 * - On approval, unassigns any of the requester's shifts that fall in the date range.
 */
export function useLeaveRequests() {
  const { business, user, role, hasPermission } = useAuth();
  const isMgr = hasPermission('manage_leave');
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [employees, setEmployees] = useState<{ user_id: string; full_name: string; primary_store_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!business || !user) return;
    setLoading(true);
    setError(null);
    let q = supabase
      .from('leave_requests')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });
    if (!isMgr) q = q.eq('user_id', user.id);
    const { data, error } = await q;
    if (error) { setError(error.message); setLoading(false); return; }

    let rows: LeaveRequestRow[] = (data ?? []).map((r: any) => ({ ...r }));
    const requestUserIds = Array.from(new Set(rows.map(r => r.user_id)));
    const [{ data: emp }, { data: profs }, { data: members }] = await Promise.all([
      isMgr
        ? supabase
            .from('employee_profiles')
            .select('user_id, store_locations:primary_store_id(name)')
            .eq('business_id', business.id)
        : Promise.resolve({ data: [] as any[] }),
      requestUserIds.length
        ? supabase.from('profiles').select('id, full_name').in('id', requestUserIds)
        : Promise.resolve({ data: [] as any[] }),
      isMgr
        ? supabase.from('memberships').select('user_id').eq('business_id', business.id).eq('is_active', true)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const nameById: Record<string, string | null> = Object.fromEntries(
      (profs ?? []).map((p: any) => [p.id, p.full_name ?? null])
    );
    const storeByUser: Record<string, { name: string | null } | null> = {};
    for (const e of (emp ?? []) as any[]) storeByUser[e.user_id] = e.store_locations ?? null;
    rows = rows.map(r => ({
      ...r,
      profiles: { full_name: nameById[r.user_id] ?? null },
      primary_store: storeByUser[r.user_id] ?? null,
    }));
    if (isMgr) {
      const memberIds = Array.from(new Set((members ?? []).map((m: any) => m.user_id)));
      const missingIds = memberIds.filter(id => !(id in nameById));
      const { data: missingProfiles } = missingIds.length
        ? await supabase.from('profiles').select('id, full_name').in('id', missingIds)
        : { data: [] as any[] };
      for (const p of missingProfiles ?? []) nameById[p.id] = p.full_name ?? null;
      setEmployees(memberIds.map((id) => ({
        user_id: id,
        full_name: nameById[id] ?? 'Employee',
        primary_store_name: storeByUser[id]?.name ?? null,
      })).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    } else {
      setEmployees([]);
    }
    setRequests(rows);
    setLoading(false);
  }, [business, user, isMgr]);

  useEffect(() => { load(); }, [load]);

  // Live updates: any insert/update/delete on leave_requests in this business reloads.
  useEffect(() => {
    if (!business) return;
    const channel = supabase
      .channel(`leave_requests:${business.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_requests', filter: `business_id=eq.${business.id}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [business, load]);

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
      source: 'employee_request',
      created_by_user_id: user.id,
      created_by_role: 'employee',
    } as any);
    if (error) throw error;
    await load();
  }, [business, user, load]);

  const addForEmployee = useCallback(async (input: ManagementLeaveInput) => {
    if (!business || !user || !role || !isMgr) throw new Error('Not authorised');

    const { data: overlaps, error: overlapError } = await supabase
      .from('leave_requests')
      .select('id')
      .eq('business_id', business.id)
      .eq('user_id', input.user_id)
      .in('status', ['pending', 'approved'])
      .lte('start_date', input.end_date)
      .gte('end_date', input.start_date)
      .limit(1);

    if (overlapError) throw overlapError;
    if ((overlaps ?? []).length > 0) {
      throw new Error('This employee already has leave covering part of those dates');
    }

    const { data: conflictingShifts, error: shiftLookupError } = await supabase
      .from('shifts')
      .select('id')
      .eq('business_id', business.id)
      .eq('assigned_user_id', input.user_id)
      .gte('shift_date', input.start_date)
      .lte('shift_date', input.end_date);
    if (shiftLookupError) throw shiftLookupError;

    const approvedAt = new Date().toISOString();
    const source = role === 'owner' ? 'owner_created' : 'manager_created';
    const { error } = await supabase.from('leave_requests').insert({
      business_id: business.id,
      user_id: input.user_id,
      leave_type: input.leave_type,
      start_date: input.start_date,
      end_date: input.end_date,
      reason: input.reason ?? null,
      manager_note: input.manager_note ?? null,
      source,
      status: 'approved',
      created_by_user_id: user.id,
      created_by_role: role,
      approved_by: user.id,
      approved_at: approvedAt,
      reviewed_by: user.id,
      reviewed_at: approvedAt,
      review_notes: input.manager_note ?? null,
      sickness_meta: input.leave_type === 'sick' ? (input.sickness_meta ?? null) : null,
      lifecycle_status: input.leave_type === 'sick' ? (input.lifecycle_status ?? 'recorded_absence') : null,
    } as any);
    if (error) throw error;

    const { error: shiftError } = await supabase
      .from('shifts')
      .update({ assigned_user_id: null, status: 'unassigned' })
      .eq('business_id', business.id)
      .eq('assigned_user_id', input.user_id)
      .gte('shift_date', input.start_date)
      .lte('shift_date', input.end_date);
    if (shiftError) throw shiftError;

    const totalUncoveredMinutes = (conflictingShifts ?? []).reduce((acc: number, _s: any) => acc + 0, 0);
    void totalUncoveredMinutes; // reserved for future enrichment

    await load();
    return { conflictingShiftCount: conflictingShifts?.length ?? 0 };
  }, [business, user, role, isMgr, load]);

  const updateSickness = useCallback(async (id: string, patch: { sickness_meta?: SicknessMeta | null; lifecycle_status?: SicknessLifecycleStatus | null; }) => {
    const { error } = await supabase
      .from('leave_requests')
      .update(patch as any)
      .eq('id', id);
    if (error) throw error;
    await load();
  }, [load]);

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

  const pendingCount = useMemo(() => requests.filter(r => r.status === 'pending').length, [requests]);

  return { requests, loading, error, isMgr, pendingCount, employees, load, submit, addForEmployee, cancelOwn, review };
}
