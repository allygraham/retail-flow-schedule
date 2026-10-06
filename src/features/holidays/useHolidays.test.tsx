import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useHolidays } from './useHolidays';
import { customRowToHoliday } from './useCustomHolidays';
import type { CustomHolidayRow } from './types';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), custom: vi.fn(), reload: vi.fn() }));
vi.mock('@/features/auth/authContext', () => ({ useAuth: mocks.auth }));
vi.mock('./useCustomHolidays', async importOriginal => ({ ...await importOriginal<typeof import('./useCustomHolidays')>(), useCustomHolidays: mocks.custom }));
const closure: CustomHolidayRow = { id: 'closure', business_id: 'shop', date: '2026-01-01', name: 'Company closure', blocks_scheduling: true };
const custom = (rows: CustomHolidayRow[] = []) => ({ rows, loading: false, error: null, reload: mocks.reload });
beforeEach(() => { mocks.auth.mockReturnValue({ business: { id: 'shop', public_holidays_enabled: true, public_holidays_region: 'england' } }); mocks.custom.mockReturnValue(custom()); });
afterEach(cleanup);
it('company closures override public holidays in lookup and range results without duplicates', () => {
  mocks.custom.mockReturnValue(custom([closure]));
  const { result } = renderHook(useHolidays);
  expect(result.current.get(closure.date)).toEqual(customRowToHoliday(closure));
  expect(result.current.inRange(closure.date, closure.date)).toEqual([customRowToHoliday(closure)]);
  expect(result.current.getBlocking(closure.date)?.id).toBe('closure');
});
it('retains blocking company closures when public holidays are disabled', () => {
  mocks.auth.mockReturnValue({ business: { id: 'shop', public_holidays_enabled: false, public_holidays_region: 'england' } });
  mocks.custom.mockReturnValue(custom([closure]));
  const { result } = renderHook(useHolidays);
  expect(result.current.enabled).toBe(false);
  expect(result.current.getBlocking(closure.date)?.id).toBe('closure');
  expect(result.current.inRange('2026-01-01', '2026-12-31')).toEqual([customRowToHoliday(closure)]);
});
it('neither public nor nonblocking custom holidays prevent scheduling', () => {
  const { result, rerender } = renderHook(useHolidays);
  expect(result.current.get(closure.date)?.kind).toBe('public');
  expect(result.current.getBlocking(closure.date)).toBeUndefined();
  mocks.custom.mockReturnValue(custom([{ ...closure, blocks_scheduling: false }])); rerender();
  expect(result.current.get(closure.date)?.kind).toBe('custom');
  expect(result.current.getBlocking(closure.date)).toBeUndefined();
});
it('includes both range endpoints, excludes outside dates and sorts custom closures', () => {
  mocks.auth.mockReturnValue({ business: { id: 'shop', public_holidays_enabled: false } });
  mocks.custom.mockReturnValue(custom(['2026-01-03', '2026-01-01', '2026-01-02', '2026-01-04'].map((date, i) => ({ ...closure, id: String(i), date }))));
  const { result } = renderHook(useHolidays);
  expect(result.current.inRange('2026-01-02', '2026-01-03').map(h => h.date)).toEqual(['2026-01-02', '2026-01-03']);
});
it('exposes loading failures and the original retry action', () => {
  mocks.custom.mockReturnValue({ ...custom(), loading: true, error: 'Company holidays unavailable' });
  const { result } = renderHook(useHolidays);
  expect(result.current.loading).toBe(true);
  expect(result.current.error).toBe('Company holidays unavailable');
  expect(result.current.reload).toBe(mocks.reload);
});
it('uses the current business and drops old company closures when switching workspace', () => {
  mocks.custom.mockReturnValue(custom([closure]));
  const { result, rerender } = renderHook(useHolidays);
  expect(result.current.getBlocking(closure.date)?.id).toBe('closure');
  mocks.auth.mockReturnValue({ business: { id: 'other-shop', public_holidays_enabled: false } });
  mocks.custom.mockReturnValue(custom()); rerender();
  expect(mocks.custom).toHaveBeenLastCalledWith('other-shop');
  expect(result.current.getBlocking(closure.date)).toBeUndefined();
});
