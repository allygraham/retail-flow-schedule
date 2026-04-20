export type HolidayRegion = 'england' | 'scotland';

export interface PublicHoliday {
  /** Stable ID: `${region}-${date}` */
  id: string;
  region: HolidayRegion;
  /** ISO date `YYYY-MM-DD` */
  date: string;
  name: string;
  year: number;
  /** Optional classification, e.g. "bank", "national" */
  type?: string;
}

export interface HolidayRegionMeta {
  value: HolidayRegion;
  label: string;
}

export const HOLIDAY_REGIONS: HolidayRegionMeta[] = [
  { value: 'england', label: 'England & Wales' },
  { value: 'scotland', label: 'Scotland' },
];
