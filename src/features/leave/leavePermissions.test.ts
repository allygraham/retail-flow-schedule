import { describe, expect, it } from 'vitest';
import { canCancelLeave } from './leavePermissions';
const request = { user_id: 'employee', status: 'approved' as const, source: 'owner_created' as const };
describe('leave cancellation controls', () => {
  it('allows owner and manager cancellation for another employee', () => {
    expect(canCancelLeave('owner', 'owner', request)).toBe(true);
    expect(canCancelLeave('manager', 'manager', request)).toBe(true);
  });
  it('does not allow an employee to cancel management-created leave', () => {
    expect(canCancelLeave('employee', 'employee', request)).toBe(false);
  });
  it('allows managers to withdraw their own employee requests', () => {
    expect(canCancelLeave('manager', 'employee', { ...request, source: 'employee_request' })).toBe(true);
    expect(canCancelLeave('manager', 'employee', request)).toBe(false);
  });
  it('hides actions for terminal requests and signed-out users', () => {
    expect(canCancelLeave('owner', 'owner', { ...request, status: 'cancelled' })).toBe(false);
    expect(canCancelLeave('owner', 'owner', { ...request, status: 'rejected' })).toBe(false);
    expect(canCancelLeave('owner', undefined, request)).toBe(false);
  });
});
