import type { AppRole, LeaveRequest } from '@/types/domain';

export function canCancelLeave(role: AppRole | null, userId: string | undefined, request: Pick<LeaveRequest, 'user_id' | 'source' | 'status'>): boolean {
  if (!userId || !['pending', 'approved'].includes(request.status)) return false;
  return role === 'owner'
    || ((role === 'manager' || role === 'admin') && request.user_id !== userId)
    || (request.user_id === userId && request.source === 'employee_request');
}
