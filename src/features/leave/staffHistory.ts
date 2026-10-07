import { calculateLeaveDays, workingDates, type BalanceRequest } from './leaveDays';

export function staffYearSummary(records: readonly BalanceRequest[], year: number, workingDays: readonly number[], today: string) {
  const annual = calculateLeaveDays(records, year, workingDays);
  const elapsed = records.filter(row => row.start_date <= today).map(row => ({ ...row, end_date: row.end_date > today ? today : row.end_date }));
  const taken = calculateLeaveDays(elapsed, year, workingDays).taken;
  const sickDates = new Set<string>();
  let spells = 0;
  for (const row of elapsed) {
    if (row.leave_type !== 'sick' || row.status !== 'approved') continue;
    const dates = workingDates(row.start_date, row.end_date, [0, 1, 2, 3, 4, 5, 6], year);
    if (dates.length) spells++;
    dates.forEach(date => sickDates.add(date));
  }
  return { taken, booked: annual.taken - taken, pending: annual.pending, sickDays: sickDates.size, sickSpells: spells };
}
