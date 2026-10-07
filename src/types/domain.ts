export type AppRole = 'owner' | 'manager' | 'employee';
export type ScheduleStatus = 'draft' | 'published';
export type ShiftStatus = 'scheduled' | 'unassigned' | 'cancelled';
export type LeaveType = 'annual' | 'unpaid' | 'sick' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveSource = 'employee_request' | 'manager_created' | 'owner_created';
export type EmploymentType = 'full_time' | 'part_time' | 'casual' | 'contractor';

export interface Business {
  leave_year_mode?: 'calendar' | 'tax' | 'financial';
  leave_year_start_date?: string | null;
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  public_holidays_enabled?: boolean;
  public_holidays_region?: string;
}
export interface Profile { id: string; full_name: string | null; avatar_url: string | null; phone: string | null; }
export interface StoreLocation {
  id: string; business_id: string; name: string; address: string | null;
  city: string | null; postcode: string | null; timezone: string | null; is_active: boolean;
}
export interface RoleCatalog { id: string; business_id: string; name: string; color: string | null; }
export interface EmployeeProfile {
  working_days: number[] | null;
  id: string; user_id: string; business_id: string;
  primary_store_id: string | null; primary_role_id: string | null;
  employment_type: EmploymentType; contracted_hours: number | null;
  hire_date: string | null; hourly_rate: number | null; notes: string | null;
}
export interface Shift {
  id: string; business_id: string; schedule_id: string | null;
  store_id: string; role_id: string | null; assigned_user_id: string | null;
  shift_date: string; start_time: string; end_time: string;
  break_minutes: number; status: ShiftStatus; notes: string | null;
  is_published: boolean;
}
export interface Schedule {
  id: string; business_id: string; store_id: string | null;
  week_start: string; status: ScheduleStatus; published_at: string | null;
}
export interface LeaveRequest {
  charged_working_days: number[] | null;
  id: string; business_id: string; user_id: string;
  leave_type: LeaveType; status: LeaveStatus; source: LeaveSource;
  start_date: string; end_date: string; reason: string | null;
  reviewed_by: string | null; reviewed_at: string | null; review_notes: string | null;
  created_by_user_id: string | null; created_by_role: AppRole | null;
  approved_at: string | null; approved_by: string | null; manager_note: string | null;
  created_at: string;
}

export interface TeamMember {
  user_id: string;
  full_name: string;
  email?: string;
  role: AppRole;
  primary_store_id: string | null;
  primary_role_id: string | null;
  primary_role_name?: string | null;
  primary_store_name?: string | null;
  employment_type: EmploymentType;
  contracted_hours: number | null;
}
