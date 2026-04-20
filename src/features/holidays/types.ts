export type HolidayRegion = 'england' | 'scotland';

/** Source of a holiday — public (built-in) or custom (per-business). */
export type HolidayKind = 'public' | 'custom';

export interface PublicHoliday {
  /** Stable ID. For public: `${region}-${date}`. For custom: row id. */
  id: string;
  /** Region only meaningful for public holidays. */
  region?: HolidayRegion;
  /** ISO date `YYYY-MM-DD` */
  date: string;
  name: string;
  year: number;
  /** Optional classification, e.g. "bank", "national". */
  type?: string;
  kind: HolidayKind;
  /** When true, scheduling on this date should be blocked (custom only). */
  blocksScheduling?: boolean;
}

export interface CustomHolidayRow {
  id: string;
  business_id: string;
  date: string;
  name: string;
  blocks_scheduling: boolean;
}

export interface HolidayRegionMeta {
  value: HolidayRegion;
  label: string;
}

export const HOLIDAY_REGIONS: HolidayRegionMeta[] = [
  { value: 'england', label: 'England & Wales' },
  { value: 'scotland', label: 'Scotland' },
];
