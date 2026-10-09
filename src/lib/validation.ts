import { z } from 'zod';

export const signupSchema = z.object({
  fullName: z.string().min(2, 'Enter your full name'),
  businessName: z.string().min(2, 'Enter your business name'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotSchema = z.object({ email: z.string().email() });

export const resetSchema = z.object({
  password: z.string().min(8, 'At least 8 characters'),
  confirm: z.string().min(8),
}).refine((v) => v.password === v.confirm, {
  message: 'Passwords do not match', path: ['confirm']
});

export const shiftSchema = z.object({
  store_id: z.string().uuid('Pick a store'),
  role_id: z.string().uuid().optional().nullable(),
  assigned_user_id: z.string().uuid().optional().nullable(),
  shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date').refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Pick a valid date'),
  start_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/, 'Enter a valid time'),
  end_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/, 'Enter a valid time'),
  break_minutes: z.coerce.number().int().min(0).max(240).default(0),
  notes: z.string().max(500).optional().nullable(),
  is_published: z.boolean().default(false),
}).superRefine((shift, ctx) => {
  const minutes = (value: string) => { const [h, m, s = '0'] = value.split(':'); return Number(h)*60 + Number(m) + Number(s)/60; };
  const duration = minutes(shift.end_time) - minutes(shift.start_time);
  if (duration <= 0) ctx.addIssue({ code: 'custom', message: 'Shift end time must be after start time', path: ['end_time'] });
  if (shift.break_minutes >= duration) ctx.addIssue({ code: 'custom', message: 'Break must be shorter than the shift', path: ['break_minutes'] });
});
export type ShiftInput = z.infer<typeof shiftSchema>;

export const leaveSchema = z.object({
  leave_type: z.enum(['annual','unpaid','sick','other']),
  start_date: z.string().min(8),
  end_date: z.string().min(8),
  reason: z.string().max(500).optional(),
}).refine(v => v.end_date >= v.start_date, { message: 'End date must be after start', path: ['end_date'] });
export type LeaveInput = z.infer<typeof leaveSchema>;

export const managementLeaveSchema = z.object({
  user_id: z.string().uuid('Pick an employee'),
  leave_type: z.enum(['annual', 'unpaid', 'sick']),
  start_date: z.string().min(8),
  end_date: z.string().min(8),
  reason: z.string().max(500).optional().nullable(),
  manager_note: z.string().max(500).optional().nullable(),
  status: z.literal('approved'),
  sickness_meta: z.any().optional().nullable(),
  lifecycle_status: z.string().optional().nullable(),
}).refine(v => v.end_date >= v.start_date, { message: 'End date must be after start', path: ['end_date'] });
export type ManagementLeaveInput = z.infer<typeof managementLeaveSchema>;

export const storeSchema = z.object({
  name: z.string().min(2, 'Required'),
  address: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
});
export type StoreInput = z.infer<typeof storeSchema>;

export const inviteEmployeeSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(60),
  last_name: z.string().trim().min(1, 'Last name is required').max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(255),
  role: z.enum(['employee', 'manager', 'owner', 'admin']),
  primary_store_id: z.string().uuid('Pick a primary store').nullable(),
  primary_role_id: z.string().uuid().optional().nullable(),
  contracted_hours: z.coerce.number().min(0).max(168).optional().nullable(),
  hire_date: z.string().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
}).refine(data => data.role === 'admin' || !!data.primary_store_id, { message: 'Pick a primary store', path: ['primary_store_id'] });
export type InviteEmployeeInput = z.infer<typeof inviteEmployeeSchema>;

export const acceptInviteSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(120),
  password: z.string().min(8, 'At least 8 characters'),
});
