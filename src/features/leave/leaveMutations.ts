import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { SicknessMeta } from './sickness';


function checkedResult(data: { leave_id: string; released_shift_count: number }[] | null, action: string) {
  if (!data?.[0]) throw new Error(`Leave ${action} returned no result`);
  const result = data[0];
  if (!Array.isArray(data) || data.length !== 1 || typeof result.leave_id !== 'string' || !result.leave_id.trim()
    || !Number.isInteger(result.released_shift_count) || result.released_shift_count < 0) {
    throw new Error(`Leave ${action} returned an invalid result`);
  }
  return result;
}

export async function recordEmployeeLeave(businessId: string, input: {
  user_id: string; leave_type: 'annual' | 'unpaid' | 'sick'; start_date: string; end_date: string;
  reason?: string | null; manager_note?: string | null; sickness_meta?: SicknessMeta | null;
  lifecycle_status?: string | null;
}) {
  const { data, error } = await supabase.rpc('record_employee_leave', {
    _business_id: businessId, _user_id: input.user_id, _leave_type: input.leave_type,
    _start_date: input.start_date, _end_date: input.end_date, _reason: input.reason ?? null,
    _manager_note: input.manager_note ?? null,
    _sickness_meta: input.leave_type === 'sick' ? (input.sickness_meta as Json ?? null) : null,
    _lifecycle_status: input.leave_type === 'sick' ? (input.lifecycle_status ?? 'recorded_absence') : null,
  });
  if (error) throw error;
  return checkedResult(data, 'recording');
}

export async function reviewEmployeeLeave(businessId: string, input: {
  id: string; status: 'approved' | 'rejected'; review_notes?: string | null;
}) {
  const { data, error } = await supabase.rpc('review_employee_leave', {
    _business_id: businessId, _leave_id: input.id, _status: input.status,
    _review_notes: input.review_notes ?? null,
  });
  if (error) throw error;
  return checkedResult(data, 'review');
}
