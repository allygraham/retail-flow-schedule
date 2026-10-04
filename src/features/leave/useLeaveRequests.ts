import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { recordEmployeeLeave, reviewEmployeeLeave } from './leaveMutations';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/authContext';
import type { LeaveRequest, LeaveStatus, LeaveSource } from '@/types/domain';
import { parseSicknessMeta, type SicknessMeta, type SicknessLifecycleStatus } from './sickness';

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
  lifecycle_status?: SicknessLifecycleStatus | string | null;
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
  const [workingDaysByUser, setWorkingDaysByUser] = useState<Record<string, number[] | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setRequests([]); setEmployees([]); setWorkingDaysByUser({});
    if (!business || !user) { setError(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .rpc('get_leave_requests', { _business_id: business.id })
        .order('created_at', { ascending: false });
      if (!isMgr) q = q.eq('user_id', user.id);
      const { data, error } = await q;
      if (request !== sequence.current) return;
      if (error) throw error;

      let rows: LeaveRequestRow[] = (data ?? []).map((r) => ({ ...r, source: r.source as LeaveSource, sickness_meta: r.sickness_meta === null ? null : parseSicknessMeta(r.sickness_meta), lifecycle_status: r.lifecycle_status as SicknessLifecycleStatus | null }));
      const requestUserIds = Array.from(new Set(rows.map(r => r.user_id)));
      const [empResult, profsResult, membersResult] = await Promise.all([
        isMgr
          ? supabase
              .from('employee_profiles')
              .select('user_id, working_days, store_locations:primary_store_id(name)')
              .eq('business_id', business.id)
          : Promise.resolve({ data: [] }),
        requestUserIds.length
          ? supabase.from('profiles').select('id, full_name').in('id', requestUserIds)
          : Promise.resolve({ data: [] }),
        isMgr
          ? supabase.from('memberships').select('user_id').eq('business_id', business.id).eq('is_active', true)
          : Promise.resolve({ data: [] }),
      ]);

      if (request !== sequence.current) return;
      for (const result of [empResult, profsResult, membersResult]) if ('error' in result && result.error) throw result.error;
      const emp = empResult.data, profs = profsResult.data, members = membersResult.data;
      setWorkingDaysByUser(Object.fromEntries((emp ?? []).map(e => [e.user_id, e.working_days ?? null])));
      const nameById: Record<string, string | null> = Object.fromEntries(
        (profs ?? []).map((p) => [p.id, p.full_name ?? null])
      );
      const storeByUser: Record<string, { name: string | null } | null> = {};
      for (const e of (emp ?? [])) storeByUser[e.user_id] = e.store_locations ?? null;
      rows = rows.map(r => ({
        ...r,
        profiles: { full_name: nameById[r.user_id] ?? null },
        primary_store: storeByUser[r.user_id] ?? null,
      }));
      if (isMgr) {
        const memberIds = Array.from(new Set((members ?? []).map((m) => m.user_id)));
        const missingIds = memberIds.filter(id => !(id in nameById));
        const missingResult = missingIds.length
          ? await supabase.from('profiles').select('id, full_name').in('id', missingIds)
          : { data: [], error: null };
        if (request !== sequence.current) return;
        if (missingResult.error) throw missingResult.error;
        const missingProfiles = missingResult.data;
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
    } catch {
      if (request === sequence.current) {
        setRequests([]); setEmployees([]); setWorkingDaysByUser({});
        setError('Could not load leave requests. Please try again.');
      }
    } finally { if (request === sequence.current) setLoading(false); }
  }, [business, user, isMgr]);

  useEffect(() => { const requests = sequence; void load(); return () => { requests.current++; }; }, [load]);

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
    });
    if (error) throw error;
    await load();
  }, [business, user, load]);

  const addForEmployee = useCallback(async (input: ManagementLeaveInput) => {
    if (!business || !user || !role || !isMgr) throw new Error('Not authorised');

    const result = await recordEmployeeLeave(business.id, input);
    await load();
    return { conflictingShiftCount: result.released_shift_count };
  }, [business, user, role, isMgr, load]);

  const updateSickness = useCallback(async (id: string, patch: { sickness_meta?: SicknessMeta | null; lifecycle_status?: SicknessLifecycleStatus | null; }) => {
    const { error } = await supabase
      .from('leave_requests')
      .update({ ...patch, ...(patch.sickness_meta ? { sickness_meta: { ...patch.sickness_meta } } : {}) })
      .eq('id', id);
    if (error) throw error;
    await load();
  }, [load]);

  const cancelOwn = useCallback(async (id: string) => {
    if (!business || !user) throw new Error('Not ready');
    const { error } = await supabase.rpc('cancel_leave_request', { _business_id: business.id, _leave_id: id });
    if (error) throw error;
    await load();
  }, [business, user, load]);

  const review = useCallback(async ({ id, status, review_notes }: ReviewInput) => {
    if (!business || !user || !isMgr) throw new Error('Not authorised');
    await reviewEmployeeLeave(business.id, { id, status, review_notes });
    await load();
  }, [business, user, isMgr, load]);

  const pendingCount = useMemo(() => requests.filter(r => r.status === 'pending').length, [requests]);

  return { workingDaysByUser, requests, loading, error, isMgr, pendingCount, employees, load, submit, addForEmployee, cancelOwn, review, updateSickness };
}
