import type { AppRole } from '@/types/domain';

export const PERMISSIONS: Record<string, readonly AppRole[]> = {
  manage_settings: ['owner', 'admin'],
  manage_stores: ['owner', 'admin'],
  manage_staff: ['owner', 'admin', 'manager'],
  manage_schedules: ['owner', 'admin', 'manager'],
  manage_leave: ['owner', 'admin', 'manager'],
  view_reports: ['owner', 'admin'],
  view_operational_dashboards: ['owner', 'admin', 'manager'],
  view_own_schedule: ['owner', 'admin', 'manager', 'employee'],
  request_leave: ['owner', 'manager', 'employee'],
  view_leave: ['owner', 'admin', 'manager', 'employee'],
  view_change_history: ['owner', 'admin'],
  view_own_requests: ['owner', 'admin', 'manager', 'employee'],
} as const;

export type AppPermission = keyof typeof PERMISSIONS;

export type AppNavItem = 'dashboard' | 'rota' | 'leave' | 'team' | 'stores' | 'profile' | 'settings' | 'history' | 'payroll';

export const NAV_PERMISSIONS: Partial<Record<AppNavItem, AppPermission>> = {
  dashboard: 'view_own_schedule',
  rota: 'view_own_schedule',
  leave: 'view_leave',
  history: 'view_change_history',
  payroll: 'view_reports',
  team: 'manage_staff',
  stores: 'manage_stores',
  profile: 'view_own_schedule',
  settings: 'manage_settings',
};

export function hasPermission(role: AppRole | null | undefined, permission: AppPermission) {
  if (!role || !Object.prototype.hasOwnProperty.call(PERMISSIONS, permission)) return false;
  return PERMISSIONS[permission].includes(role);
}

export function hasAnyPermission(role: AppRole | null | undefined, permissions: AppPermission[]) {
  return permissions.some((permission) => hasPermission(role, permission));
}