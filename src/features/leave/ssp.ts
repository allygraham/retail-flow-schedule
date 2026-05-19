/**
 * Statutory Sick Pay (SSP) — lightweight operational estimator.
 *
 * IMPORTANT: This is *not* payroll software. It does not perform legally
 * authoritative HMRC calculations and must not be used as the basis for
 * RTI/payroll submissions. The numbers here are intended only to give a
 * manager a quick operational steer (e.g. "is this person likely to qualify?",
 * "rough SSP estimate to flag to payroll").
 *
 * Logic is intentionally simple and centralised so it can be refined later
 * without touching UI components.
 */

import { daysBetween } from './useLeaveBalance';

// --- Configurable constants ----------------------------------------------
// These values should be reviewed each tax year. They are intentionally NOT
// fetched from the database so engineers can audit them in one place.

/** Weekly SSP rate in GBP. Update annually. (2025/26 rate used here.) */
export const SSP_WEEKLY_RATE_GBP = 116.75;

/** Number of "waiting days" before SSP becomes payable. */
export const SSP_WAITING_DAYS = 3;

/** Minimum consecutive sick days (PIW) before SSP can start. */
export const SSP_MIN_PIW_DAYS = 4;

/** Default qualifying days per week (Mon–Fri assumption — refine per worker). */
export const SSP_DEFAULT_QUALIFYING_DAYS_PER_WEEK = 5;

// -------------------------------------------------------------------------

export interface SspEstimateInput {
  start_date: string; // ISO
  end_date: string;   // ISO
  /** Days from previous linked sickness periods already counted (waiting days served). */
  linkedDaysAlreadyCounted?: number;
  /** Optional override for qualifying days per week (defaults to 5). */
  qualifyingDaysPerWeek?: number;
  /** Whether this absence has been marked as paid (used for UI hints only). */
  paid?: boolean;
}

export interface SspEstimate {
  /** Total calendar days of the current absence. */
  totalDays: number;
  /** Qualifies as a PIW (Period of Incapacity for Work). */
  qualifies: boolean;
  /** Number of waiting days still to be served. */
  waitingDaysRemaining: number;
  /** Number of qualifying days that SSP is estimated for. */
  payableDays: number;
  /** Estimated SSP value in GBP. */
  estimateGbp: number;
  /** ISO date from which SSP becomes payable (after waiting days). */
  eligibleFrom: string | null;
  /** Plain English summary for the UI. */
  summary: string;
}

/**
 * Estimate SSP for a single sickness absence. Treats `linkedDaysAlreadyCounted`
 * as days that already contributed to the waiting-day requirement from a
 * previous linked PIW.
 *
 * NOTE: This intentionally uses a simplified daily rate
 * (weekly rate / qualifying days per week) rather than a full HMRC table
 * lookup. Refine here if payroll needs higher precision.
 */
export function estimateSsp(input: SspEstimateInput): SspEstimate {
  const total = Math.max(0, daysBetween(input.start_date, input.end_date));
  const qpw = input.qualifyingDaysPerWeek ?? SSP_DEFAULT_QUALIFYING_DAYS_PER_WEEK;
  const dailyRate = SSP_WEEKLY_RATE_GBP / qpw;

  const alreadyServed = Math.max(0, input.linkedDaysAlreadyCounted ?? 0);
  const waitingRemaining = Math.max(0, SSP_WAITING_DAYS - alreadyServed);

  const qualifies = total + alreadyServed >= SSP_MIN_PIW_DAYS;

  const payableDays = qualifies ? Math.max(0, total - waitingRemaining) : 0;
  const estimate = Math.round(payableDays * dailyRate * 100) / 100;

  let eligibleFrom: string | null = null;
  if (qualifies && waitingRemaining < total) {
    const d = new Date(input.start_date + 'T00:00:00');
    d.setDate(d.getDate() + waitingRemaining);
    eligibleFrom = d.toISOString().slice(0, 10);
  }

  let summary: string;
  if (!qualifies) {
    summary = `Absence is under ${SSP_MIN_PIW_DAYS} days — does not yet form a Period of Incapacity for Work.`;
  } else if (payableDays === 0) {
    summary = `Waiting days still being served. SSP would begin after ${waitingRemaining} more qualifying day${waitingRemaining === 1 ? '' : 's'}.`;
  } else {
    summary = `Estimated SSP for ${payableDays} qualifying day${payableDays === 1 ? '' : 's'} at £${dailyRate.toFixed(2)}/day.`;
  }

  return {
    totalDays: total,
    qualifies,
    waitingDaysRemaining: waitingRemaining,
    payableDays,
    estimateGbp: estimate,
    eligibleFrom,
    summary,
  };
}

/**
 * Detect linked sickness periods. HMRC links absences if separated by ≤ 8 weeks.
 * Returns the total qualifying-day count from previous linked PIWs so the
 * estimator can skip waiting days the employee has already served.
 */
export function findLinkedSicknessDays(
  current: { start_date: string; end_date: string },
  history: { start_date: string; end_date: string; leave_type: string }[],
  linkWindowDays = 56,
): number {
  const start = new Date(current.start_date + 'T00:00:00').getTime();
  let total = 0;
  for (const h of history) {
    if (h.leave_type !== 'sick') continue;
    if (h.start_date === current.start_date && h.end_date === current.end_date) continue;
    const end = new Date(h.end_date + 'T00:00:00').getTime();
    if (end >= start) continue;
    const gap = (start - end) / (1000 * 60 * 60 * 24);
    if (gap <= linkWindowDays) {
      total += Math.max(0, daysBetween(h.start_date, h.end_date));
    }
  }
  return total;
}
