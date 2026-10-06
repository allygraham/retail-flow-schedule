import type { AppRole } from '@/types/domain';

export const PERMISSIONS: Record<string, readonly AppRole[]> = {
  manage_settings: ['owner'],
  manage_stores: ['owner'],
  manage_staff: ['owner', 'manager'],
  manage_schedules: ['owner', 'manager'],
  manage_leave: ['owner', 'manager'],
  view_reports: ['owner'],
  view_operational_dashboards: ['owner', 'manager'],
  view_own_schedule: ['owner', 'manager', 'employee'],
  request_leave: ['owner', 'manager', 'employee'],
  view_own_requests: ['owner', 'manager', 'employee'],
} as const;

export type AppPermission = keyof typeof PERMISSIONS;

export type AppNavItem = 'dashboard' | 'rota' | 'leave' | 'team' | 'stores' | 'profile' | 'settings';

export const NAV_PERMISSIONS: Partial<Record<AppNavItem, AppPermission>> = {
  dashboard: 'view_own_schedule',
  rota: 'view_own_schedule',
  leave: 'request_leave',
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