import { describe, expect, it } from 'vitest';
import { hasAnyPermission, hasPermission } from './permissions';
import type { AppRole } from '@/types/domain';

describe('permission boundaries', () => {
  it.each(['manage_settings', 'manage_stores', 'view_reports'])('%s allows owners and admins', permission => {
    expect(hasPermission('owner', permission)).toBe(true);
    expect(hasPermission('admin', permission)).toBe(true);
    for (const role of ['manager', 'employee', null, undefined] as const) expect(hasPermission(role, permission)).toBe(false);
  });
  it.each(['manage_staff', 'manage_schedules', 'manage_leave', 'view_operational_dashboards'])('%s allows management but excludes employees', permission => {
    expect(hasPermission('owner', permission)).toBe(true);
    expect(hasPermission('admin', permission)).toBe(true);
    expect(hasPermission('manager', permission)).toBe(true);
    expect(hasPermission('employee', permission)).toBe(false);
  });
  it.each(['view_own_schedule', 'request_leave', 'view_own_requests'])('%s requires a recognised signed-in role', permission => {
    for (const role of ['owner', 'manager', 'employee'] as const) expect(hasPermission(role, permission)).toBe(true);
    for (const role of [null, undefined, 'administrator' as AppRole]) expect(hasPermission(role, permission)).toBe(false);
  });
  it('admins can read history but cannot request leave', () => {
    expect(hasPermission('admin', 'view_change_history')).toBe(true);
    expect(hasPermission('owner', 'view_change_history')).toBe(true);
    expect(hasPermission('manager', 'view_change_history')).toBe(false);
    expect(hasPermission('employee', 'view_change_history')).toBe(false);
    expect(hasPermission('admin', 'request_leave')).toBe(false);
  });
  it('any-permission checks require at least one allowed permission', () => {
    expect(hasAnyPermission('employee', ['manage_staff', 'request_leave'])).toBe(true);
    expect(hasAnyPermission('employee', ['manage_staff', 'manage_settings'])).toBe(false);
    expect(hasAnyPermission('owner', [])).toBe(false);
    expect(hasAnyPermission(null, ['request_leave'])).toBe(false);
  });
  it.each(['unknown_permission', 'toString', '__proto__'])('fails closed for an invalid permission: %s', permission => {
    expect(hasPermission('owner', permission)).toBe(false);
    expect(hasAnyPermission('owner', [permission, 'request_leave'])).toBe(true);
  });
});
