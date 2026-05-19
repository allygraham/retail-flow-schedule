import type { LeaveRequest } from '@/types/domain';

/**
 * Sickness lifecycle status — operational, workflow-oriented states stored
 * alongside the existing leave_requests.status field. We keep the original
 * status (pending/approved/rejected/cancelled) for filtering compatibility,
 * and use lifecycle_status to expose richer absence stages to managers.
 *
 * Stored as plain text in DB so engineers can extend later without migrations.
 */
export type SicknessLifecycleStatus =
  | 'recorded_absence'
  | 'pending_review'
  | 'awaiting_fit_note'
  | 'returned_to_work'
  | 'closed';

export const SICKNESS_LIFECYCLE_OPTIONS: { value: SicknessLifecycleStatus; label: string }[] = [
  { value: 'recorded_absence', label: 'Recorded absence' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'awaiting_fit_note', label: 'Awaiting fit note' },
  { value: 'returned_to_work', label: 'Returned to work' },
  { value: 'closed', label: 'Closed' },
];

export const SICKNESS_LIFECYCLE_LABEL: Record<SicknessLifecycleStatus, string> =
  Object.fromEntries(SICKNESS_LIFECYCLE_OPTIONS.map(o => [o.value, o.label])) as any;

export const SICKNESS_LIFECYCLE_TONE: Record<SicknessLifecycleStatus, 'neutral' | 'pending' | 'success' | 'info' | 'danger'> = {
  recorded_absence: 'info',
  pending_review: 'pending',
  awaiting_fit_note: 'pending',
  returned_to_work: 'success',
  closed: 'neutral',
};

export type SicknessCategory =
  | 'cold_flu'
  | 'stomach_bug'
  | 'mental_health'
  | 'injury'
  | 'migraine'
  | 'family_emergency'
  | 'other';

export const SICKNESS_CATEGORY_OPTIONS: { value: SicknessCategory; label: string }[] = [
  { value: 'cold_flu', label: 'Cold / flu' },
  { value: 'stomach_bug', label: 'Stomach bug' },
  { value: 'mental_health', label: 'Mental health' },
  { value: 'injury', label: 'Injury' },
  { value: 'migraine', label: 'Migraine' },
  { value: 'family_emergency', label: 'Family emergency' },
  { value: 'other', label: 'Other' },
];

export const SICKNESS_CATEGORY_LABEL: Record<SicknessCategory, string> =
  Object.fromEntries(SICKNESS_CATEGORY_OPTIONS.map(o => [o.value, o.label])) as any;

export interface SicknessMeta {
  category?: SicknessCategory | null;
  return_to_work_date?: string | null;
  self_certified?: boolean;
  fit_note_received?: boolean;
  work_related_injury?: boolean;
  paid_absence?: boolean;
  return_to_work_interview_required?: boolean;
}

export function parseSicknessMeta(value: unknown): SicknessMeta {
  if (!value || typeof value !== 'object') return {};
  return value as SicknessMeta;
}

/**
 * Bradford Factor: S² × D, where S = number of separate absence spells in the
 * rolling period and D = total days absent. Informational only — never use as
 * a sole basis for disciplinary action.
 */
export interface BradfordResult {
  score: number;
  spells: number;
  days: number;
  concern: 'low' | 'moderate' | 'high';
  concernLabel: string;
}

export function bradfordScore(
  sickAbsences: { start_date: string; end_date: string }[],
  rollingDays = 365,
  asOf: Date = new Date(),
): BradfordResult {
  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - rollingDays);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  let spells = 0;
  let days = 0;
  for (const a of sickAbsences) {
    if (a.end_date < cutoffISO) continue;
    spells += 1;
    const start = new Date(a.start_date + 'T00:00:00');
    const end = new Date(a.end_date + 'T00:00:00');
    const d = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    days += d;
  }

  const score = spells * spells * days;
  let concern: BradfordResult['concern'] = 'low';
  if (score >= 200) concern = 'high';
  else if (score >= 50) concern = 'moderate';

  const concernLabel = concern === 'high' ? 'High concern' : concern === 'moderate' ? 'Moderate concern' : 'Low concern';
  return { score, spells, days, concern, concernLabel };
}

export function isSickLeave(r: Pick<LeaveRequest, 'leave_type'>) {
  return r.leave_type === 'sick';
}
