import type { HolidayRegion, PublicHoliday } from './types';
import { ENGLAND_HOLIDAYS } from './data/england';
import { SCOTLAND_HOLIDAYS } from './data/scotland';

/** Registry — add new regions here (Wales, NI, IE, etc.) without touching UI. */
const REGISTRY: Record<HolidayRegion, PublicHoliday[]> = {
  england: ENGLAND_HOLIDAYS,
  scotland: SCOTLAND_HOLIDAYS,
};

export function getAllHolidays(region: HolidayRegion): PublicHoliday[] {
  return REGISTRY[region] ?? [];
}

/** Returns holidays whose date falls within [startISO, endISO], inclusive. */
export function getHolidaysInRange(
  region: HolidayRegion,
  startISO: string,
  endISO: string,
): PublicHoliday[] {
  return getAllHolidays(region).filter((h) => h.date >= startISO && h.date <= endISO);
}

/** Map of ISO date → holiday for fast lookup. */
export function holidayMap(region: HolidayRegion): Map<string, PublicHoliday> {
  const m = new Map<string, PublicHoliday>();
  for (const h of getAllHolidays(region)) m.set(h.date, h);
  return m;
}

export function findHoliday(
  region: HolidayRegion,
  isoDate: string,
): PublicHoliday | undefined {
  return getAllHolidays(region).find((h) => h.date === isoDate);
}
