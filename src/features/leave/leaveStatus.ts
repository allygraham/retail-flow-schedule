import type { LeaveSource, LeaveStatus, LeaveType } from '@/types/domain';

/** UI label for a leave status. We store 'rejected' in the DB but show 'Declined'. */
export const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Declined',
  cancelled: 'Cancelled',
};

export const STATUS_TONE: Record<LeaveStatus, 'pending' | 'success' | 'danger' | 'neutral'> = {
  pending: 'pending',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

export const TYPE_LABEL: Record<LeaveType, string> = {
  annual: 'Annual leave',
  unpaid: 'Unpaid',
  sick: 'Sick',
  other: 'Other',
};

export const TYPE_TONE: Record<LeaveType, 'leave' | 'sick' | 'unavail' | 'neutral'> = {
  annual: 'leave',
  sick: 'sick',
  unpaid: 'unavail',
  other: 'neutral',
};

export const SOURCE_LABEL: Record<LeaveSource, string> = {
  employee_request: 'Employee request',
  manager_created: 'Manager added',
  owner_created: 'Owner added',
};

export const SOURCE_TONE: Record<LeaveSource, 'neutral' | 'info' | 'brand'> = {
  employee_request: 'neutral',
  manager_created: 'info',
  owner_created: 'brand',
};
