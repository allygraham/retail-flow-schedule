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
  shift_date: z.string().min(8),
  start_time: z.string().regex(/^\d{2}:\d{2}/, 'HH:MM'),
  end_time: z.string().regex(/^\d{2}:\d{2}/, 'HH:MM'),
  break_minutes: z.coerce.number().min(0).max(240).default(0),
  notes: z.string().max(500).optional().nullable(),
});
export type ShiftInput = z.infer<typeof shiftSchema>;

export const leaveSchema = z.object({
  leave_type: z.enum(['annual','unpaid','sick','other']),
  start_date: z.string().min(8),
  end_date: z.string().min(8),
  reason: z.string().max(500).optional(),
}).refine(v => v.end_date >= v.start_date, { message: 'End date must be after start', path: ['end_date'] });
export type LeaveInput = z.infer<typeof leaveSchema>;

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
  role: z.enum(['employee', 'manager', 'owner']),
  primary_store_id: z.string().uuid('Pick a primary store'),
  primary_role_id: z.string().uuid().optional().nullable(),
  contracted_hours: z.coerce.number().min(0).max(168).optional().nullable(),
  hire_date: z.string().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});
export type InviteEmployeeInput = z.infer<typeof inviteEmployeeSchema>;

export const acceptInviteSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(120),
  password: z.string().min(8, 'At least 8 characters'),
});
