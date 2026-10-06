import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { recordEmployeeLeave, reviewEmployeeLeave } from './leaveMutations';
const input = { user_id: 'employee', leave_type: 'annual' as const, start_date: '2026-11-02', end_date: '2026-11-02', manager_note: 'Private medical detail' };
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: [{ leave_id: 'leave', released_shift_count: 2 }], error: null }); });
describe('atomic leave mutations', () => {
  it.each(['annual', 'unpaid', 'sick'] as const)('records %s with one transaction and no copied feedback', async (leave_type) => {
    const result = await recordEmployeeLeave('business', { ...input, leave_type, sickness_meta: { self_certified: true } });
    expect(result.released_shift_count).toBe(2); expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0]; expect(name).toBe('record_employee_leave');
    expect(args._manager_note).toBe(input.manager_note); expect(args).not.toHaveProperty('_review_notes');
    expect(args._sickness_meta).toEqual(leave_type === 'sick' ? { self_certified: true } : null);
    expect(args._lifecycle_status).toBe(leave_type === 'sick' ? 'recorded_absence' : null);
  });
  it.each(['approved', 'rejected'] as const)('reviews %s in one transaction with explicit feedback', async (status) => {
    await reviewEmployeeLeave('business', { id: 'leave', status, review_notes: 'Employee feedback' });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('review_employee_leave', { _business_id: 'business', _leave_id: 'leave', _status: status, _review_notes: 'Employee feedback' });
  });
  it.each(['record', 'review'])('propagates %s transaction failure without reporting success', async (kind) => {
    const error = { message: 'Unable to release shift' }; rpc.mockResolvedValue({ data: null, error });
    await expect(kind === 'record' ? recordEmployeeLeave('business', input) : reviewEmployeeLeave('business', { id: 'leave', status: 'approved' })).rejects.toEqual(error);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('rejects an empty server result', async () => {
    rpc.mockResolvedValue({ data: [], error: null }); await expect(recordEmployeeLeave('business', input)).rejects.toThrow('no result');
    await expect(reviewEmployeeLeave('business', { id: 'leave', status: 'approved' })).rejects.toThrow('no result');
  });
});


describe('leave transaction response integrity', () => {
  const mutate = (kind: string) => kind === 'record' ? recordEmployeeLeave('business', input) : reviewEmployeeLeave('business', { id: 'leave', status: 'approved' });
  it.each(['record', 'review'])('accepts a successful %s with no shifts to release', async kind => {
    rpc.mockResolvedValue({ data: [{ leave_id: 'leave', released_shift_count: 0 }], error: null });
    expect(await mutate(kind)).toEqual({ leave_id: 'leave', released_shift_count: 0 });
  });
  it.each(['record', 'review'])('propagates a rejected %s request without retrying the transaction automatically', async kind => {
    rpc.mockRejectedValue(new Error('Offline'));
    await expect(mutate(kind)).rejects.toThrow('Offline');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    { leave_id: '', released_shift_count: 0 },
    { leave_id: null, released_shift_count: 0 },
    { leave_id: 'leave', released_shift_count: -1 },
    { leave_id: 'leave', released_shift_count: 0.5 },
    { leave_id: 'leave', released_shift_count: '2' },
  ])('rejects malformed successful transaction data: %j', async response => {
    rpc.mockResolvedValue({ data: [response], error: null });
    await expect(mutate('record')).rejects.toThrow('invalid result');
    await expect(mutate('review')).rejects.toThrow('invalid result');
  });
  it('rejects an ambiguous response containing multiple results', async () => {
    rpc.mockResolvedValue({ data: [{ leave_id: 'one', released_shift_count: 0 }, { leave_id: 'two', released_shift_count: 0 }], error: null });
    await expect(mutate('record')).rejects.toThrow('invalid result');
    await expect(mutate('review')).rejects.toThrow('invalid result');
  });
  it('keeps a one-day request on its exact dates and preserves private sickness metadata', async () => {
    await recordEmployeeLeave('business', { ...input, leave_type: 'sick', start_date: '2026-11-28', end_date: '2026-11-28', lifecycle_status: 'awaiting_fit_note', sickness_meta: { fit_note_received: false, return_to_work_date: null } });
    expect(rpc).toHaveBeenCalledWith('record_employee_leave', expect.objectContaining({ _business_id: 'business', _start_date: '2026-11-28', _end_date: '2026-11-28', _lifecycle_status: 'awaiting_fit_note', _sickness_meta: { fit_note_received: false, return_to_work_date: null } }));
  });
});
