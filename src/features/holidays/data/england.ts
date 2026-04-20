import type { PublicHoliday } from '../types';

/** UK Bank holidays — England & Wales. Source: gov.uk */
const RAW: Array<Omit<PublicHoliday, 'id' | 'region' | 'year'>> = [
  // 2024
  { date: '2024-01-01', name: "New Year's Day", type: 'bank' },
  { date: '2024-03-29', name: 'Good Friday', type: 'bank' },
  { date: '2024-04-01', name: 'Easter Monday', type: 'bank' },
  { date: '2024-05-06', name: 'Early May bank holiday', type: 'bank' },
  { date: '2024-05-27', name: 'Spring bank holiday', type: 'bank' },
  { date: '2024-08-26', name: 'Summer bank holiday', type: 'bank' },
  { date: '2024-12-25', name: 'Christmas Day', type: 'bank' },
  { date: '2024-12-26', name: 'Boxing Day', type: 'bank' },
  // 2025
  { date: '2025-01-01', name: "New Year's Day", type: 'bank' },
  { date: '2025-04-18', name: 'Good Friday', type: 'bank' },
  { date: '2025-04-21', name: 'Easter Monday', type: 'bank' },
  { date: '2025-05-05', name: 'Early May bank holiday', type: 'bank' },
  { date: '2025-05-26', name: 'Spring bank holiday', type: 'bank' },
  { date: '2025-08-25', name: 'Summer bank holiday', type: 'bank' },
  { date: '2025-12-25', name: 'Christmas Day', type: 'bank' },
  { date: '2025-12-26', name: 'Boxing Day', type: 'bank' },
  // 2026
  { date: '2026-01-01', name: "New Year's Day", type: 'bank' },
  { date: '2026-04-03', name: 'Good Friday', type: 'bank' },
  { date: '2026-04-06', name: 'Easter Monday', type: 'bank' },
  { date: '2026-05-04', name: 'Early May bank holiday', type: 'bank' },
  { date: '2026-05-25', name: 'Spring bank holiday', type: 'bank' },
  { date: '2026-08-31', name: 'Summer bank holiday', type: 'bank' },
  { date: '2026-12-25', name: 'Christmas Day', type: 'bank' },
  { date: '2026-12-28', name: 'Boxing Day (substitute day)', type: 'bank' },
  // 2027
  { date: '2027-01-01', name: "New Year's Day", type: 'bank' },
  { date: '2027-03-26', name: 'Good Friday', type: 'bank' },
  { date: '2027-03-29', name: 'Easter Monday', type: 'bank' },
  { date: '2027-05-03', name: 'Early May bank holiday', type: 'bank' },
  { date: '2027-05-31', name: 'Spring bank holiday', type: 'bank' },
  { date: '2027-08-30', name: 'Summer bank holiday', type: 'bank' },
  { date: '2027-12-27', name: 'Christmas Day (substitute day)', type: 'bank' },
  { date: '2027-12-28', name: 'Boxing Day (substitute day)', type: 'bank' },
];

export const ENGLAND_HOLIDAYS: PublicHoliday[] = RAW.map((h) => ({
  id: `england-${h.date}`,
  region: 'england',
  year: Number(h.date.slice(0, 4)),
  ...h,
}));
