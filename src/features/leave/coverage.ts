import { supabase } from '@/integrations/supabase/client';

export interface AffectedShift {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  store_id: string;
  role_id: string | null;
  break_minutes: number | null;
  store_name?: string | null;
  role_name?: string | null;
}

export interface ReplacementCandidate {
  user_id: string;
  full_name: string;
  reason: string;
  /** Lower is better — used for ranking. */
  score: number;
}

/**
 * Shifts that were left uncovered after an absence is recorded. Pulled by
 * (business, dates) with status 'unassigned' OR still assigned to user.
 */
export async function fetchAffectedShifts(
  businessId: string,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<AffectedShift[]> {
  // Pull shifts that overlap the absence window for this employee — they may
  // already be unassigned by the approval hook, in which case they show up as
  // open coverage opportunities.
  const { data: assigned } = await supabase
    .from('shifts')
    .select('id, shift_date, start_time, end_time, store_id, role_id, break_minutes')
    .eq('business_id', businessId)
    .eq('assigned_user_id', userId)
    .gte('shift_date', startDate)
    .lte('shift_date', endDate);

  const { data: open } = await supabase
    .from('shifts')
    .select('id, shift_date, start_time, end_time, store_id, role_id, break_minutes')
    .eq('business_id', businessId)
    .eq('status', 'unassigned')
    .is('assigned_user_id', null)
    .gte('shift_date', startDate)
    .lte('shift_date', endDate);

  const rows = [...(assigned ?? []), ...(open ?? [])];
  const seen = new Set<string>();
  const dedup: AffectedShift[] = [];
  for (const r of rows as any[]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    dedup.push(r);
  }

  // Enrich with store + role names (cheap parallel lookup).
  const storeIds = Array.from(new Set(dedup.map(d => d.store_id).filter(Boolean)));
  const roleIds = Array.from(new Set(dedup.map(d => d.role_id).filter(Boolean) as string[]));
  const [{ data: stores }, { data: roles }] = await Promise.all([
    storeIds.length ? supabase.from('store_locations').select('id, name').in('id', storeIds) : Promise.resolve({ data: [] as any[] }),
    roleIds.length ? supabase.from('roles_catalog').select('id, name').in('id', roleIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const storeName: Record<string, string> = Object.fromEntries((stores ?? []).map((s: any) => [s.id, s.name]));
  const roleName: Record<string, string> = Object.fromEntries((roles ?? []).map((r: any) => [r.id, r.name]));

  return dedup
    .map(d => ({ ...d, store_name: storeName[d.store_id] ?? null, role_name: d.role_id ? roleName[d.role_id] ?? null : null }))
    .sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.start_time.localeCompare(b.start_time));
}

/**
 * Replacement candidates ranked by store/role match + low scheduled hours that
 * week. Excludes employees on leave for the shift date.
 */
export async function suggestReplacements(
  businessId: string,
  shift: AffectedShift,
  excludeUserIds: string[] = [],
): Promise<ReplacementCandidate[]> {
  const { data: profiles } = await supabase
    .from('employee_profiles')
    .select('user_id, primary_store_id, primary_role_id')
    .eq('business_id', businessId);

  if (!profiles?.length) return [];

  const userIds = profiles.map((p: any) => p.user_id).filter((id: string) => !excludeUserIds.includes(id));
  if (!userIds.length) return [];

  const [{ data: names }, { data: leaves }, { data: weekShifts }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('id', userIds),
    supabase
      .from('leave_requests')
      .select('user_id')
      .eq('business_id', businessId)
      .in('user_id', userIds)
      .in('status', ['approved', 'pending'])
      .lte('start_date', shift.shift_date)
      .gte('end_date', shift.shift_date),
    supabase
      .from('shifts')
      .select('assigned_user_id, start_time, end_time, break_minutes, shift_date')
      .eq('business_id', businessId)
      .eq('shift_date', shift.shift_date)
      .in('assigned_user_id', userIds),
  ]);

  const nameById: Record<string, string> = Object.fromEntries((names ?? []).map((n: any) => [n.id, n.full_name ?? 'Employee']));
  const onLeave = new Set((leaves ?? []).map((l: any) => l.user_id));

  // Detect direct shift-time conflicts (cannot double-book).
  const sameDay = (weekShifts ?? []) as any[];
  const conflictById = new Set<string>();
  for (const ws of sameDay) {
    if (!ws.assigned_user_id) continue;
    if (ws.start_time < shift.end_time && ws.end_time > shift.start_time) {
      conflictById.add(ws.assigned_user_id);
    }
  }

  const candidates: ReplacementCandidate[] = [];
  for (const p of profiles as any[]) {
    if (!userIds.includes(p.user_id)) continue;
    if (onLeave.has(p.user_id)) continue;
    if (conflictById.has(p.user_id)) continue;

    let score = 100;
    const reasons: string[] = [];
    if (p.primary_store_id === shift.store_id) { score -= 40; reasons.push('Same store'); }
    if (shift.role_id && p.primary_role_id === shift.role_id) { score -= 30; reasons.push('Role match'); }
    if (reasons.length === 0) reasons.push('Available');

    candidates.push({
      user_id: p.user_id,
      full_name: nameById[p.user_id] ?? 'Employee',
      reason: reasons.join(' · '),
      score,
    });
  }

  candidates.sort((a, b) => a.score - b.score || a.full_name.localeCompare(b.full_name));
  return candidates.slice(0, 6);
}

/**
 * Assign a candidate to a shift and mark scheduled. Caller handles toasts.
 */
export async function assignReplacement(shiftId: string, userId: string) {
  const { error } = await supabase
    .from('shifts')
    .update({ assigned_user_id: userId, status: 'scheduled' })
    .eq('id', shiftId);
  if (error) throw error;
}

/**
 * Notify candidates that shifts are open for pickup. Best-effort insert; per-row
 * failures are surfaced as a thrown error so the caller can warn the manager.
 */
export async function notifyCandidatesOfOpenShifts(
  businessId: string,
  candidates: ReplacementCandidate[],
  shifts: AffectedShift[],
) {
  if (!candidates.length || !shifts.length) return 0;
  const summary = shifts.length === 1
    ? `${shifts[0].shift_date} ${shifts[0].start_time.slice(0,5)}–${shifts[0].end_time.slice(0,5)}`
    : `${shifts.length} open shifts`;
  const rows = candidates.map(c => ({
    business_id: businessId,
    user_id: c.user_id,
    type: 'shift_open_for_pickup',
    title: 'Shifts open for pickup',
    body: `Cover needed: ${summary}. Tap to view.`,
    link: '/rota',
  }));
  const { error } = await supabase.from('notifications').insert(rows as any);
  if (error) throw error;
  return rows.length;
}

/**
 * Ensure all affected shifts are released for open coverage (status 'unassigned',
 * no assignee). Idempotent — safe to call even if shifts already open.
 */
export async function openShiftsForPickup(shiftIds: string[]) {
  if (!shiftIds.length) return;
  const { error } = await supabase
    .from('shifts')
    .update({ assigned_user_id: null, status: 'unassigned' })
    .in('id', shiftIds);
  if (error) throw error;
}
