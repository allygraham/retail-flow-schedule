import { lazy, Suspense, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/authContext';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { Select } from '@/components/common/Field';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';
import { Activity, Coins, NotebookPen } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/errors';
import { fmtDate } from '@/lib/datetime';
import { SOURCE_LABEL, STATUS_LABEL, TYPE_LABEL } from './leaveStatus';
import { parseSicknessMeta, SICKNESS_CATEGORY_LABEL, SICKNESS_LIFECYCLE_LABEL, SICKNESS_LIFECYCLE_OPTIONS, type SicknessLifecycleStatus, type SicknessMeta } from './sickness';
import type { LeaveRequestRow } from './useLeaveRequests';
import s from '@/app/(app)/Leave.module.scss';

const OperationalImpactCard = lazy(() => import('./OperationalImpactCard').then(module => ({ default: module.OperationalImpactCard })));
const CoverageRecoveryCard = lazy(() => import('./CoverageRecoveryCard').then(module => ({ default: module.CoverageRecoveryCard })));
const SspPanel = lazy(() => import('./SspPanel').then(module => ({ default: module.SspPanel })));

interface Props {
  supportingHistoryReady?: boolean;
  supportingStatus?: ReactNode;
  deferCoverage?: boolean;
  returnFocusTo?: HTMLElement | null;
  detailsRow: LeaveRequestRow | null;
  setDetailsRow: Dispatch<SetStateAction<LeaveRequestRow | null>>;
  requests: LeaveRequestRow[];
  workingDaysByUser: Record<string, number[] | null>;
  durationLabel: (request: LeaveRequestRow) => string;
  updateSickness: (id: string, patch: { sickness_meta?: SicknessMeta | null; lifecycle_status?: SicknessLifecycleStatus | null }) => Promise<void>;
}
export function AbsenceDetailsModal({ detailsRow, setDetailsRow, requests, workingDaysByUser, durationLabel, updateSickness, returnFocusTo, supportingHistoryReady = true, supportingStatus, deferCoverage = false }: Props) {
  const { business, hasPermission } = useAuth();
  const isMgr = hasPermission('manage_leave');
  return (
      <Modal
        open={!!detailsRow}
        returnFocusTo={returnFocusTo}
        onClose={() => setDetailsRow(null)}
        title="Absence details"
        size="lg"
        footer={
          <>
            {isMgr && detailsRow?.leave_type === 'sick' && (
              <Select
                value={(detailsRow.lifecycle_status as string) ?? 'recorded_absence'}
                onChange={async (e) => {
                  if (!detailsRow) return;
                  try {
                    await updateSickness(detailsRow.id, { lifecycle_status: e.target.value as SicknessLifecycleStatus });
                    setDetailsRow({ ...detailsRow, lifecycle_status: e.target.value as SicknessLifecycleStatus });
                    toast.success('Sickness status updated');
                  } catch (err) { toast.error(errorMessage(err, 'Could not update')); }
                }}
              >
                {SICKNESS_LIFECYCLE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
            <Button onClick={() => setDetailsRow(null)}>Close</Button>
          </>
        }
      >
        {detailsRow && (() => {
          const meta = parseSicknessMeta(detailsRow.sickness_meta);
          const isSick = detailsRow.leave_type === 'sick';
          const history = requests
            .filter(r => r.user_id === detailsRow.user_id && r.status === 'approved')
            .map(r => ({ id: r.id, start_date: r.start_date, end_date: r.end_date, leave_type: r.leave_type, status: r.status }));
          return (
            <div className={s.noteViewer}>
              {supportingStatus}
              <div className={s.detailList}>
                <div className={s.detailRow}><span>Employee</span><strong>{detailsRow.profiles?.full_name ?? 'Employee'}</strong></div>
                <div className={s.detailRow}><span>Type</span><strong>{TYPE_LABEL[detailsRow.leave_type]}</strong></div>
                <div className={s.detailRow}><span>Dates</span><strong>{fmtDate(detailsRow.start_date, 'd MMM')} → {fmtDate(detailsRow.end_date, 'd MMM yyyy')}</strong></div>
                <div className={s.detailRow}><span>Duration</span><strong>{durationLabel(detailsRow)}</strong></div>
                {isSick ? (
                  <div className={s.detailRow}>
                    <span>Sickness status</span>
                    <strong>{detailsRow.lifecycle_status
                      ? SICKNESS_LIFECYCLE_LABEL[detailsRow.lifecycle_status as SicknessLifecycleStatus]
                      : 'Recorded absence'}</strong>
                  </div>
                ) : (
                  <div className={s.detailRow}><span>Status</span><strong>{STATUS_LABEL[detailsRow.status]}</strong></div>
                )}
                <div className={s.detailRow}><span>Source</span><strong>{SOURCE_LABEL[detailsRow.source]}</strong></div>
                {isSick && meta.category && (
                  <div className={s.detailRow}><span>Category</span><strong>{SICKNESS_CATEGORY_LABEL[meta.category]}</strong></div>
                )}
                {isSick && meta.return_to_work_date && (
                  <div className={s.detailRow}><span>Return to work</span><strong>{fmtDate(meta.return_to_work_date, 'd MMM yyyy')}</strong></div>
                )}
              </div>

              {isSick && (
                <div className={s.indicatorRow}>
                  {meta.self_certified && <span className={s.indicator}>Self-certified</span>}
                  {meta.fit_note_received && <span className={s.indicator}>Fit note received</span>}
                  {meta.work_related_injury && <span className={s.indicator}>Work-related injury</span>}
                  {meta.return_to_work_interview_required && <span className={s.indicator}>RTW interview required</span>}
                  {meta.paid_absence !== undefined && <span className={s.indicator}>{meta.paid_absence ? 'Paid' : 'Unpaid'}</span>}
                </div>
              )}

              {isMgr && business && (deferCoverage ? <CollapsibleSection title="Shift cover" icon={<Activity size={14} />} tone="subtle" defaultOpen={false}>
                <Suspense fallback={null}><CoverageRecoveryCard businessId={business.id} userId={detailsRow.user_id} startDate={detailsRow.start_date} endDate={detailsRow.end_date} /></Suspense>
              </CollapsibleSection> : <Suspense fallback={null}><CoverageRecoveryCard businessId={business.id} userId={detailsRow.user_id} startDate={detailsRow.start_date} endDate={detailsRow.end_date} /></Suspense>)}

              {isMgr && (
                <CollapsibleSection
                  title="Operational impact"
                  icon={<Activity size={14} />}
                  tone="subtle"
                  defaultOpen={false}
                  meta="Shifts affected · uncovered hours"
                >
                  <Suspense fallback={null}><OperationalImpactCard
                    userId={detailsRow.user_id}
                    startDate={detailsRow.start_date}
                    endDate={detailsRow.end_date}
                  /></Suspense>
                </CollapsibleSection>
              )}

              {isSick && isMgr && (
                <CollapsibleSection
                  title="SSP estimate"
                  icon={<Coins size={14} />}
                  tone="subtle"
                  defaultOpen={false}
                  meta="Operational guidance"
                >
                  {supportingHistoryReady ? <Suspense fallback={null}><SspPanel
                    key={`${detailsRow.id}:${detailsRow.start_date}:${detailsRow.end_date}`}
                    requestId={detailsRow.id}
                    startDate={detailsRow.start_date}
                    endDate={detailsRow.end_date}
                    history={history}
                    workingDays={workingDaysByUser[detailsRow.user_id]}
                    employeeName={detailsRow.profiles?.full_name ?? undefined}
                  /></Suspense> : <p>Sickness history must finish refreshing before calculating SSP.</p>}
                </CollapsibleSection>
              )}

              {(detailsRow.reason || detailsRow.manager_note || detailsRow.review_notes) && (
                <CollapsibleSection
                  title="Notes & history"
                  icon={<NotebookPen size={14} />}
                  tone="subtle"
                  defaultOpen={false}
                >
                  <div className={s.form}>
                    {detailsRow.reason && (
                      <div className={s.detailBlock}>
                        <span className={s.reasonLabel}>Reason</span>
                        <p>{detailsRow.reason}</p>
                      </div>
                    )}
                    {detailsRow.manager_note && (
                      <div className={s.detailBlock}>
                        <span className={s.reasonLabel}>Manager note</span>
                        <p>{detailsRow.manager_note}</p>
                      </div>
                    )}
                    {detailsRow.review_notes && (
                      <div className={s.detailBlock}>
                        <span className={s.reasonLabel}>Review note</span>
                        <p>{detailsRow.review_notes}</p>
                      </div>
                    )}
                  </div>
                </CollapsibleSection>
              )}
            </div>
          );
        })()}
      </Modal>

  );
}
