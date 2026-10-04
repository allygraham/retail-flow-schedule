import { describe, expect, it } from 'vitest';
import { planShiftDrop, type MovableShift } from './shiftMoves';
const source: MovableShift = { id: 'source', assigned_user_id: 'employee-a', shift_date: '2026-11-02', updated_at: '2026-10-04T10:00:00Z', status: 'scheduled' };
const target: MovableShift = { id: 'target', assigned_user_id: 'employee-b', shift_date: '2026-11-03', updated_at: '2026-10-04T11:00:00Z', status: 'scheduled' };
describe('rota drag planning', () => {
  it('moves to an empty cell with the version seen by the manager', () => {
    expect(planShiftDrop([source], source, 'employee-b', '2026-11-03')).toMatchObject({
      _shift_id: 'source', _assigned_user_id: 'employee-b', _shift_date: '2026-11-03', _expected_updated_at: source.updated_at,
    });
  });
  it('includes both row versions in one swap request', () => {
    expect(planShiftDrop([source,target], source, 'employee-b', '2026-11-03')).toMatchObject({
      _swap_shift_id: 'target', _swap_expected_updated_at: target.updated_at, _expected_updated_at: source.updated_at,
    });
  });
  it('rejects ambiguous cells rather than selecting an arbitrary shift', () => {
    expect(() => planShiftDrop([source,target,{...target,id:'another'}], source, 'employee-b', '2026-11-03')).toThrow('multiple shifts');
  });
  it('ignores cancelled target shifts', () => {
    expect(planShiftDrop([source,{...target,status:'cancelled'}], source, 'employee-b', '2026-11-03')?._swap_shift_id).toBeUndefined();
  });
  it('releases a shift without swapping it with an unrelated open shift', () => {
    const open = {...target,assigned_user_id:null};
    expect(planShiftDrop([source,open], source, null, '2026-11-03')?._swap_shift_id).toBeUndefined();
  });
  it('does nothing for a drop into the original cell', () => {
    expect(planShiftDrop([source], source, source.assigned_user_id, source.shift_date)).toBeNull();
  });
  it('does not reactivate a cancelled source shift through dragging', () => {
    expect(() => planShiftDrop([], {...source,status:'cancelled'}, 'employee-b', '2026-11-03')).toThrow('Cancelled');
  });
});
