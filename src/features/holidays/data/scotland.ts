import type { PublicHoliday } from '../types';

/** UK Bank holidays — Scotland. Source: gov.uk */
const RAW: Array<Omit<PublicHoliday, 'id' | 'region' | 'year'>> = [
  // 2024
  { date: '2024-01-01', name: "New Year's Day", type: 'bank' },
  { date: '2024-01-02', name: '2nd January', type: 'bank' },
  { date: '2024-03-29', name: 'Good Friday', type: 'bank' },
  { date: '2024-05-06', name: 'Early May bank holiday', type: 'bank' },
  { date: '2024-05-27', name: 'Spring bank holiday', type: 'bank' },
  { date: '2024-08-05', name: 'Summer bank holiday', type: 'bank' },
  { date: '2024-11-30', name: "St Andrew's Day", type: 'bank' },
  { date: '2024-12-25', name: 'Christmas Day', type: 'bank' },
  { date: '2024-12-26', name: 'Boxing Day', type: 'bank' },
  // 2025
  { date: '2025-01-01', name: "New Year's Day", type: 'bank' },
  { date: '2025-01-02', name: '2nd January', type: 'bank' },
  { date: '2025-04-18', name: 'Good Friday', type: 'bank' },
  { date: '2025-05-05', name: 'Early May bank holiday', type: 'bank' },
  { date: '2025-05-26', name: 'Spring bank holiday', type: 'bank' },
  { date: '2025-08-04', name: 'Summer bank holiday', type: 'bank' },
  { date: '2025-12-01', name: "St Andrew's Day (substitute day)", type: 'bank' },
  { date: '2025-12-25', name: 'Christmas Day', type: 'bank' },
  { date: '2025-12-26', name: 'Boxing Day', type: 'bank' },
  // 2026
  { date: '2026-01-01', name: "New Year's Day", type: 'bank' },
  { date: '2026-01-02', name: '2nd January', type: 'bank' },
  { date: '2026-04-03', name: 'Good Friday', type: 'bank' },
  { date: '2026-05-04', name: 'Early May bank holiday', type: 'bank' },
  { date: '2026-05-25', name: 'Spring bank holiday', type: 'bank' },
  { date: '2026-08-03', name: 'Summer bank holiday', type: 'bank' },
  { date: '2026-11-30', name: "St Andrew's Day", type: 'bank' },
  { date: '2026-12-25', name: 'Christmas Day', type: 'bank' },
  { date: '2026-12-28', name: 'Boxing Day (substitute day)', type: 'bank' },
  // 2027
  { date: '2027-01-01', name: "New Year's Day", type: 'bank' },
  { date: '2027-01-04', name: '2nd January (substitute day)', type: 'bank' },
  { date: '2027-03-26', name: 'Good Friday', type: 'bank' },
  { date: '2027-05-03', name: 'Early May bank holiday', type: 'bank' },
  { date: '2027-05-31', name: 'Spring bank holiday', type: 'bank' },
  { date: '2027-08-02', name: 'Summer bank holiday', type: 'bank' },
  { date: '2027-11-30', name: "St Andrew's Day", type: 'bank' },
  { date: '2027-12-27', name: 'Christmas Day (substitute day)', type: 'bank' },
  { date: '2027-12-28', name: 'Boxing Day (substitute day)', type: 'bank' },
];

export const SCOTLAND_HOLIDAYS: PublicHoliday[] = RAW.map((h) => ({
  id: `scotland-${h.date}`,
  region: 'scotland',
  year: Number(h.date.slice(0, 4)),
  ...h,
}));
