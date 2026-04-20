import { useMemo } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { holidayMap, getHolidaysInRange } from './holidayService';
import type { HolidayRegion, PublicHoliday } from './types';

interface UseHolidaysResult {
  enabled: boolean;
  region: HolidayRegion | null;
  /** Empty map when disabled. */
  byDate: Map<string, PublicHoliday>;
  /** Holidays within the given inclusive ISO range, or [] when disabled. */
  inRange: (startISO: string, endISO: string) => PublicHoliday[];
  /** Lookup helper, returns undefined when disabled. */
  get: (isoDate: string) => PublicHoliday | undefined;
}

export function useHolidays(): UseHolidaysResult {
  const { business } = useAuth();
  const enabled = !!business?.public_holidays_enabled;
  const region = (business?.public_holidays_region as HolidayRegion | undefined) ?? null;

  const byDate = useMemo<Map<string, PublicHoliday>>(
    () => (enabled && region ? holidayMap(region) : new Map()),
    [enabled, region],
  );

  return {
    enabled,
    region,
    byDate,
    inRange: (s, e) => (enabled && region ? getHolidaysInRange(region, s, e) : []),
    get: (d) => (enabled && region ? byDate.get(d) : undefined),
  };
}
