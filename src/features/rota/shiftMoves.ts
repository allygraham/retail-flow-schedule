export interface MovableShift {
  id: string;
  assigned_user_id: string | null;
  shift_date: string;
  updated_at: string;
  status: string;
}

/** A populated cell must identify one shift; never silently choose the first. */
export function planShiftDrop(shifts: readonly MovableShift[], source: MovableShift, targetUser: string | null, targetDate: string) {
  if (source.status === 'cancelled') throw new Error('Cancelled shifts cannot be dragged.');
  if (source.assigned_user_id === targetUser && source.shift_date === targetDate) return null;
  const occupants = targetUser ? shifts.filter(shift => shift.id !== source.id && shift.status !== 'cancelled'
    && shift.assigned_user_id === targetUser && shift.shift_date === targetDate) : [];
  if (occupants.length > 1) throw new Error('This cell has multiple shifts. Edit the shift to choose its assignment instead.');
  const target = occupants[0];
  return {
    _shift_id: source.id,
    _assigned_user_id: targetUser,
    _shift_date: targetDate,
    _expected_updated_at: source.updated_at,
    _swap_shift_id: target?.id ?? undefined,
    _swap_expected_updated_at: target?.updated_at ?? undefined,
  };
}
