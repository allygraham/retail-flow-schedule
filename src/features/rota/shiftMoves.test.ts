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

it('retains the dragged version even if the loaded collection has a newer version', () => {
  const refreshed = { ...source, updated_at: '2026-10-06T12:00:00Z' };
  const result = planShiftDrop([refreshed, target], source, target.assigned_user_id, target.shift_date);
  expect(result?._expected_updated_at).toBe(source.updated_at);
  expect(result?._swap_expected_updated_at).toBe(target.updated_at);
});
it('moves an unassigned shift into an occupied cell using both versions', () => {
  const unassigned = { ...source, assigned_user_id: null, status: 'unassigned' };
  expect(planShiftDrop([unassigned, target], unassigned, target.assigned_user_id, target.shift_date)).toMatchObject({ _expected_updated_at: source.updated_at, _swap_shift_id: target.id, _swap_expected_updated_at: target.updated_at });
});
it('ignores shifts belonging to another employee or another date', () => {
  const others = [{ ...target, assigned_user_id: 'someone-else' }, { ...target, id: 'different-day', shift_date: '2026-11-04' }];
  expect(planShiftDrop([source, ...others], source, 'employee-b', '2026-11-03')?._swap_shift_id).toBeUndefined();
});
it('chooses the only active occupant even when cancelled shifts also occupy the cell', () => {
  expect(planShiftDrop([source, { ...target, id: 'cancelled', status: 'cancelled' }, target], source, target.assigned_user_id, target.shift_date)?._swap_shift_id).toBe(target.id);
});
it('never swaps when releasing into a date with multiple open shifts', () => {
  const open = { ...target, assigned_user_id: null, status: 'unassigned' };
  expect(planShiftDrop([source, open, { ...open, id: 'another-open' }], source, null, target.shift_date)).toMatchObject({ _assigned_user_id: null, _swap_shift_id: undefined, _swap_expected_updated_at: undefined });
});
it('does not modify the source, destination or collection while planning a swap', () => {
  const frozenSource = Object.freeze({ ...source }), frozenTarget = Object.freeze({ ...target });
  const shifts = Object.freeze([frozenSource, frozenTarget]);
  planShiftDrop(shifts, frozenSource, target.assigned_user_id, target.shift_date);
  expect(frozenSource).toEqual(source); expect(frozenTarget).toEqual(target);
});
it('preserves an exact year-boundary target date without changing the source version', () => {
  expect(planShiftDrop([source], source, 'employee-b', '2027-01-01')).toMatchObject({ _shift_date: '2027-01-01', _expected_updated_at: source.updated_at });
});
it('keeps an unassigned shift drop in its original date as a no-op', () => {
  const open = { ...source, assigned_user_id: null, status: 'unassigned' };
  expect(planShiftDrop([open], open, null, open.shift_date)).toBeNull();
});
