import { lazy, Suspense, useState, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/authContext';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { Avatar } from '@/components/common/Avatar';
import { Badge } from '@/components/common/Badge';
import { Field, Select } from '@/components/common/Field';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';
import { Activity, Coins, NotebookPen } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/errors';
import { fmtDate } from '@/lib/datetime';
import { SOURCE_LABEL, STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from './leaveStatus';
import { parseSicknessMeta, SICKNESS_CATEGORY_LABEL, SICKNESS_LIFECYCLE_LABEL, SICKNESS_LIFECYCLE_OPTIONS, type SicknessLifecycleStatus, type SicknessMeta } from './sickness';
import type { LeaveRequestRow } from './useLeaveRequests';
import s from './AbsenceDetailsModal.module.scss';

const OperationalImpactCard = lazy(() => import('./OperationalImpactCard').then(module => ({ default: module.OperationalImpactCard })));
const CoverageRecoveryCard = lazy(() => import('./CoverageRecoveryCard').then(module => ({ default: module.CoverageRecoveryCard })));
const SspPanel = lazy(() => import('./SspPanel').then(module => ({ default: module.SspPanel })));

interface Props {
  supportingHistoryReady?: boolean;
  supportingStatus?: ReactNode;
  returnFocusTo?: HTMLElement | null;
  detailsRow: LeaveRequestRow | null;
  setDetailsRow: Dispatch<SetStateAction<LeaveRequestRow | null>>;
  requests: LeaveRequestRow[];
  workingDaysByUser: Record<string, number[] | null>;
  durationLabel: (request: LeaveRequestRow) => string;
  updateSickness: (id: string, patch: { sickness_meta?: SicknessMeta | null; lifecycle_status?: SicknessLifecycleStatus | null }) => Promise<void>;
}
export function AbsenceDetailsModal({ detailsRow, setDetailsRow, requests, workingDaysByUser, durationLabel, updateSickness, returnFocusTo, supportingHistoryReady = true, supportingStatus }: Props) {
  const { business, hasPermission } = useAuth();
  const isMgr = hasPermission('manage_leave');
  const [updating, setUpdating] = useState(false);
  return (
      <Modal
        open={!!detailsRow}
        returnFocusTo={returnFocusTo}
        onClose={() => setDetailsRow(null)}
        title="Absence details"
        size="lg"
        footer={<Button variant="outline" onClick={() => setDetailsRow(null)}>Close</Button>}
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
              <div className={s.employee}>
                <Avatar name={detailsRow.profiles?.full_name} size="lg" />
                <div className={s.identity}>
                  <h3>{detailsRow.profiles?.full_name ?? 'Employee'}</h3>
                  <p>{TYPE_LABEL[detailsRow.leave_type]} · {SOURCE_LABEL[detailsRow.source]}{detailsRow.primary_store?.name ? ` · ${detailsRow.primary_store.name}` : ''}</p>
                </div>
                <Badge tone={STATUS_TONE[detailsRow.status]}>{STATUS_LABEL[detailsRow.status]}</Badge>
              </div>
              <dl className={s.summary}>
                <div><dt>Dates</dt><dd>{detailsRow.start_date === detailsRow.end_date
                  ? fmtDate(detailsRow.start_date, 'd MMM yyyy')
                  : `${fmtDate(detailsRow.start_date, 'd MMM')} → ${fmtDate(detailsRow.end_date, 'd MMM yyyy')}`}</dd></div>
                <div><dt>Duration</dt><dd>{durationLabel(detailsRow)}</dd></div>
              </dl>
              {detailsRow.reason && <section className={s.reason}><h4>Reason</h4><p>{detailsRow.reason}</p></section>}
              {isSick && <section className={s.sickness}>
                <h4>Sickness details</h4>
                <dl className={s.facts}>
                  <div><dt>Category</dt><dd>{meta.category ? SICKNESS_CATEGORY_LABEL[meta.category] : 'Not recorded'}</dd></div>
                  <div><dt>Return to work</dt><dd>{meta.return_to_work_date ? fmtDate(meta.return_to_work_date, 'd MMM yyyy') : 'Not recorded'}</dd></div>
                  {([
                    ['self_certified', 'Self-certified'],
                    ['fit_note_received', 'Fit note received'],
                    ['paid_absence', 'Paid absence'],
                    ['work_related_injury', 'Work-related injury'],
                    ['return_to_work_interview_required', 'Return-to-work interview required'],
                  ] as const).filter(([key]) => typeof meta[key] === 'boolean').map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{typeof meta[key] === 'boolean' ? (meta[key] ? 'Yes' : 'No') : 'Not recorded'}</dd></div>)}
                </dl>
                {isMgr ? <Field label="Sickness status">
                  <Select value={detailsRow.lifecycle_status ?? 'recorded_absence'} disabled={updating}
                    onChange={async e => {
                      const lifecycle_status = e.target.value as SicknessLifecycleStatus;
                      const id = detailsRow.id;
                      setUpdating(true);
                      try {
                        await updateSickness(id, { lifecycle_status });
                        setDetailsRow(current => current?.id === id ? { ...current, lifecycle_status } : current);
                        toast.success('Sickness status updated');
                      } catch (err) { toast.error(errorMessage(err, 'Could not update')); }
                      finally { setUpdating(false); }
                    }}>
                    {SICKNESS_LIFECYCLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field> : <p className={s.lifecycle}>{SICKNESS_LIFECYCLE_LABEL[detailsRow.lifecycle_status as SicknessLifecycleStatus] ?? 'Recorded absence'}</p>}
              </section>}
              {isMgr && business && <CollapsibleSection title="Shift cover" icon={<Activity size={14} />} tone="subtle">
                <Suspense fallback={null}>
                  <CoverageRecoveryCard businessId={business.id} userId={detailsRow.user_id} startDate={detailsRow.start_date} endDate={detailsRow.end_date} />
                  <OperationalImpactCard userId={detailsRow.user_id} startDate={detailsRow.start_date} endDate={detailsRow.end_date} />
                </Suspense>
              </CollapsibleSection>}

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

              {(detailsRow.manager_note || detailsRow.review_notes) && (
                <CollapsibleSection
                  title="Notes & history"
                  icon={<NotebookPen size={14} />}
                  tone="subtle"
                  defaultOpen={false}
                >
                  <div className={s.form}>
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
