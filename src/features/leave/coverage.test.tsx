import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAffectedShifts, suggestReplacements, assignReplacement, openShiftsForPickup, notifyAvailableStaff } from './coverage';
import { OperationalImpactCard } from './OperationalImpactCard';
const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>, count: 0, failure: null as number | null,
  business: { id: 'shop' },
}));
vi.mock('@/features/auth/authContext', () => ({ useAuth: () => ({ business: mocks.business }) }));
vi.mock('@/integrations/supabase/client', () => {
  const query = (table: string) => {
    let patch: Record<string, unknown> | null = null;
    let inserts: Record<string, unknown>[] | null = null;
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    const response = async () => {
      if (mocks.count++ === mocks.failure) return { data: null, error: { message: 'Unavailable' } };
      const rows = (mocks.rows[table] ?? []).filter(row => filters.every(filter => filter(row)));
      if (patch) for (const row of rows) Object.assign(row, patch);
      if (inserts) mocks.rows[table] = [...(mocks.rows[table] ?? []), ...inserts];
      return { data: rows, error: null };
    };
    const chain = {
      select: () => chain,
      update: (value: Record<string, unknown>) => { patch = value; return chain; },
      insert: (values: Record<string, unknown>[]) => { inserts = values; return chain; },
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain; },
      neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return chain; },
      is: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return chain; },
      gte: (key: string, value: string) => { filters.push(row => String(row[key]) >= value); return chain; },
      lte: (key: string, value: string) => { filters.push(row => String(row[key]) <= value); return chain; },
      then: <T,>(resolve: (value: Awaited<ReturnType<typeof response>>) => T, reject: (reason: unknown) => T) => response().then(resolve, reject),
    };
    return chain;
  };
  return { supabase: { from: query, rpc: query } };
});
const target = { id: 'target', store_id: 'store', role_id: null, shift_date: '2026-10-05', start_time: '09:00', end_time: '17:00', break_minutes: 30 };
const shift = (id: string, assigned_user_id: string | null, status: string, patch = {}) => ({ ...target, id, business_id: 'shop', assigned_user_id, status, ...patch });
beforeEach(() => {
  mocks.count = 0; mocks.failure = null;
  mocks.rows = {
    shifts: [shift('cancelled', 'absent', 'cancelled'), shift('assigned', 'absent', 'scheduled'), shift('open', null, 'unassigned'), shift('other-shop', 'absent', 'scheduled', { business_id: 'another' })],
    store_locations: [{ id: 'store', name: 'Shop' }], roles_catalog: [],
  };
});
afterEach(cleanup);
describe('affected shift coverage', () => {
  it('includes assigned and open shifts but excludes cancelled shifts and other businesses', async () => {
    const result = await fetchAffectedShifts('shop', 'absent', '2026-10-05', '2026-10-05');
    expect(result.map(row => row.id).sort()).toEqual(['assigned', 'open']);
  });
  it.each([0, 1, 2])('rejects failed shift/name query %i rather than reporting no cover', async (query) => {
    mocks.failure = query;
    await expect(fetchAffectedShifts('shop', 'absent', '2026-10-05', '2026-10-05')).rejects.toMatchObject({ message: 'Unavailable' });
  });
});
describe('replacement staff', () => {
  const prepare = () => {
    // The server directory contains only active members; a disabled employment profile must not be used instead.
    mocks.rows.get_rota_people = ['available', 'busy', 'leave', 'adjacent', 'absent'].map(user_id => ({ user_id, full_name: user_id, primary_store_id: 'store', primary_role_id: null }));
    mocks.rows.employee_profiles = [{ user_id: 'disabled', primary_store_id: 'store', primary_role_id: null }];
    mocks.rows.shifts = [shift('cancelled', 'available', 'cancelled'), shift('busy-shift', 'busy', 'scheduled'), shift('adjacent-shift', 'adjacent', 'scheduled', { start_time: '17:00', end_time: '18:00' })];
    mocks.rows.leave_requests = [{ user_id: 'leave', business_id: 'shop', start_date: '2026-10-05', end_date: '2026-10-05', status: 'approved' }];
  };
  it('allows a cancelled conflict and adjacent shift, but excludes active conflicts, leave, the absent user and disabled profiles', async () => {
    prepare();
    const result = await suggestReplacements('shop', target, ['absent']);
    expect(result.map(row => row.user_id).sort()).toEqual(['adjacent', 'available']);
  });
  it.each([0, 1, 2])('rejects failed directory/availability query %i instead of suggesting unverified staff', async (query) => {
    prepare(); mocks.failure = query;
    await expect(suggestReplacements('shop', target, ['absent'])).rejects.toMatchObject({ message: 'Unavailable' });
  });
});
describe('coverage impact shown to managers', () => {
  it('counts only active assigned shifts and deducts breaks', async () => {
    render(<OperationalImpactCard userId="absent" startDate="2026-10-05" endDate="2026-10-05" />);
    await screen.findByText('1 shift affected across 1 day');
    expect(screen.getByText('7.5 uncovered hours')).toBeInTheDocument();
  });
  it('shows a retryable error instead of a zero count when the query fails', async () => {
    mocks.failure = 0;
    render(<OperationalImpactCard userId="absent" startDate="2026-10-05" endDate="2026-10-05" />);
    await screen.findByRole('alert');
    expect(screen.queryByText(/0 shifts affected/)).not.toBeInTheDocument();
    mocks.failure = null;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('1 shift affected across 1 day');
  });
});

describe('coverage actions', () => {
  it('cannot revive a cancelled shift through assignment', async () => {
    await expect(assignReplacement('cancelled', 'cover')).rejects.toThrow('no longer available');
    expect(mocks.rows.shifts.find(row => row.id === 'cancelled')?.status).toBe('cancelled');
  });
  it('releases active shifts without reviving cancelled shifts', async () => {
    await openShiftsForPickup(['assigned', 'cancelled']);
    expect(mocks.rows.shifts.find(row => row.id === 'assigned')).toMatchObject({ status: 'unassigned', assigned_user_id: null });
    expect(mocks.rows.shifts.find(row => row.id === 'cancelled')?.status).toBe('cancelled');
  });
  it('checks every shift date and notifies each person only about their eligible shifts', async () => {
    mocks.rows.get_rota_people = ['first-day', 'second-day'].map(user_id => ({ user_id, full_name: user_id, primary_store_id: 'store', primary_role_id: null }));
    mocks.rows.shifts = [];
    mocks.rows.leave_requests = [
      { user_id: 'first-day', business_id: 'shop', start_date: '2026-10-06', end_date: '2026-10-06', status: 'approved' },
      { user_id: 'second-day', business_id: 'shop', start_date: '2026-10-05', end_date: '2026-10-05', status: 'approved' },
    ];
    expect(await notifyAvailableStaff('shop', [target, { ...target, id: 'next', shift_date: '2026-10-06' }])).toBe(2);
    expect(mocks.rows.notifications.find(row => row.user_id === 'first-day')?.body).toContain('2026-10-05');
    expect(mocks.rows.notifications.find(row => row.user_id === 'first-day')?.body).not.toContain('2026-10-06');
    expect(mocks.rows.notifications.find(row => row.user_id === 'second-day')?.body).toContain('2026-10-06');
    expect(mocks.rows.notifications.find(row => row.user_id === 'second-day')?.body).not.toContain('2026-10-05');
  });
});
