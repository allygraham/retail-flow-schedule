import { useMemo } from 'react';
import { useAuth } from '@/features/auth/authContext';
import { holidayMap, getHolidaysInRange } from './holidayService';
import { useCustomHolidays, customRowToHoliday } from './useCustomHolidays';
import type { HolidayRegion, PublicHoliday } from './types';

interface UseHolidaysResult {
  enabled: boolean;
  region: HolidayRegion | null;
  /** Map of ISO date → holiday. Custom holidays take precedence on the same date. */
  byDate: Map<string, PublicHoliday>;
  /** Holidays within the given inclusive ISO range. Always includes custom, even if public is disabled. */
  inRange: (startISO: string, endISO: string) => PublicHoliday[];
  /** Lookup helper. Returns custom or public holiday for the date. */
  get: (isoDate: string) => PublicHoliday | undefined;
  /** Custom-only convenience for scheduling enforcement. */
  getBlocking: (isoDate: string) => PublicHoliday | undefined;
}

export function useHolidays(): UseHolidaysResult {
  const { business } = useAuth();
  const enabled = !!business?.public_holidays_enabled;
  const region = (business?.public_holidays_region as HolidayRegion | undefined) ?? null;
  const { rows: customRows } = useCustomHolidays(business?.id ?? null);

  const byDate = useMemo<Map<string, PublicHoliday>>(() => {
    const m = new Map<string, PublicHoliday>();
    if (enabled && region) {
      for (const [k, v] of holidayMap(region).entries()) m.set(k, v);
    }
    // Custom always shown (per-business), and overrides public on same date.
    for (const row of customRows) m.set(row.date, customRowToHoliday(row));
    return m;
  }, [enabled, region, customRows]);

  return {
    enabled,
    region,
    byDate,
    inRange: (s, e) => {
      const pub = enabled && region ? getHolidaysInRange(region, s, e) : [];
      const cus = customRows.filter((r) => r.date >= s && r.date <= e).map(customRowToHoliday);
      // Merge with custom precedence on duplicate dates
      const map = new Map<string, PublicHoliday>();
      for (const h of pub) map.set(h.date, h);
      for (const h of cus) map.set(h.date, h);
      return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    },
    get: (d) => byDate.get(d),
    getBlocking: (d) => {
      const h = byDate.get(d);
      return h && h.kind === 'custom' && h.blocksScheduling ? h : undefined;
    },
  };
}
