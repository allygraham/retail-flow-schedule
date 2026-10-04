import { assertQueryResults } from '@/lib/queryResults';
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
  const assignedResult = await supabase
    .from('shifts')
    .select('id, shift_date, start_time, end_time, store_id, role_id, break_minutes')
    .eq('business_id', businessId)
    .eq('assigned_user_id', userId)
    .neq('status', 'cancelled')
    .gte('shift_date', startDate)
    .lte('shift_date', endDate);

  const openResult = await supabase
    .from('shifts')
    .select('id, shift_date, start_time, end_time, store_id, role_id, break_minutes')
    .eq('business_id', businessId)
    .eq('status', 'unassigned')
    .is('assigned_user_id', null)
    .gte('shift_date', startDate)
    .lte('shift_date', endDate);

  assertQueryResults(assignedResult, openResult);
  const rows = [...(assignedResult.data ?? []), ...(openResult.data ?? [])];
  const seen = new Set<string>();
  const dedup: AffectedShift[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    dedup.push(r);
  }

  // Enrich with store + role names (cheap parallel lookup).
  const storeIds = Array.from(new Set(dedup.map(d => d.store_id).filter(Boolean)));
  const roleIds = Array.from(new Set(dedup.map(d => d.role_id).filter(Boolean) as string[]));
  const nameResults = await Promise.all([
    storeIds.length ? supabase.from('store_locations').select('id, name').in('id', storeIds) : Promise.resolve({ data: [] }),
    roleIds.length ? supabase.from('roles_catalog').select('id, name').in('id', roleIds) : Promise.resolve({ data: [] }),
  ]);
  assertQueryResults(...nameResults);
  const [{ data: stores }, { data: roles }] = nameResults;
  const storeName: Record<string, string> = Object.fromEntries((stores ?? []).map((s) => [s.id, s.name]));
  const roleName: Record<string, string> = Object.fromEntries((roles ?? []).map((r) => [r.id, r.name]));

  return dedup
    .map(d => ({ ...d, store_name: storeName[d.store_id] ?? null, role_name: d.role_id ? roleName[d.role_id] ?? null : null }))
    .sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.start_time.localeCompare(b.start_time));
}

/**
 * Active replacement candidates ranked by store and role match.
 * Excludes employees on leave or with an overlapping non-cancelled shift.
 */
export async function suggestReplacements(
  businessId: string,
  shift: AffectedShift,
  excludeUserIds: string[] = [],
): Promise<ReplacementCandidate[]> {
  const staffResult = await supabase.rpc('get_rota_people', { _business_id: businessId });
  assertQueryResults(staffResult);
  const profiles = staffResult.data;

  if (!profiles?.length) return [];

  const userIds = profiles.map((p) => p.user_id).filter((id: string) => !excludeUserIds.includes(id));
  if (!userIds.length) return [];

  const availabilityResults = await Promise.all([
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
      .neq('status', 'cancelled')
      .in('assigned_user_id', userIds),
  ]);

  assertQueryResults(...availabilityResults);
  const [{ data: leaves }, { data: weekShifts }] = availabilityResults;
  const onLeave = new Set((leaves ?? []).map((l) => l.user_id));

  // Detect direct shift-time conflicts (cannot double-book).
  const sameDay = (weekShifts ?? []);
  const conflictById = new Set<string>();
  for (const ws of sameDay) {
    if (!ws.assigned_user_id) continue;
    if (ws.start_time < shift.end_time && ws.end_time > shift.start_time) {
      conflictById.add(ws.assigned_user_id);
    }
  }

  const candidates: ReplacementCandidate[] = [];
  for (const p of profiles) {
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
      full_name: p.full_name ?? 'Employee',
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
  const { data, error } = await supabase
    .from('shifts')
    .update({ assigned_user_id: userId, status: 'scheduled' })
    .eq('id', shiftId)
    .neq('status', 'cancelled')
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('This shift is no longer available. Reload coverage.');
}

/** Notify each active employee only about shifts they can actually cover. */
export async function notifyAvailableStaff(businessId: string, shifts: AffectedShift[], excludeUserIds: string[] = []) {
  const matches = await Promise.all(shifts.map(shift => suggestReplacements(businessId, shift, excludeUserIds)));
  const eligible = new Map<string, AffectedShift[]>();
  matches.forEach((candidates, index) => {
    for (const candidate of candidates) {
      const list = eligible.get(candidate.user_id) ?? [];
      list.push(shifts[index]);
      eligible.set(candidate.user_id, list);
    }
  });
  const rows = Array.from(eligible, ([user_id, available]) => ({
    business_id: businessId, user_id, type: 'shift_open_for_pickup', title: 'Shifts open for pickup',
    body: `Cover needed: ${available.map(shift => `${shift.shift_date} ${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)}`).join(', ')}. Tap to view.`,
    link: '/rota',
  }));
  if (!rows.length) return 0;
  const { error } = await supabase.from('notifications').insert(rows);
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
    .in('id', shiftIds)
    .neq('status', 'cancelled');
  if (error) throw error;
}
