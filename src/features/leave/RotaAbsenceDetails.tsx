import { useEffect, useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { DataLoadError } from '@/components/common/DataLoadError';
import { useLeaveRequests, type LeaveRequestRow } from './useLeaveRequests';
import { AbsenceDetailsModal } from './AbsenceDetailsModal';
import { daysBetween, workingDaysBetween } from './leaveDays';

export default function RotaAbsenceDetails({ request, onClose, returnFocusTo }: { request: LeaveRequestRow; onClose: () => void; returnFocusTo: HTMLElement | null }) {
  const { requests, workingDaysByUser, loading, error, load, updateSickness } = useLeaveRequests();
  const [detailsRow, setDetailsRow] = useState<LeaveRequestRow | null>(request);
  useEffect(() => { if (!loading && !error) setDetailsRow(requests.find(row => row.id === request.id) ?? null); }, [requests, request.id, loading, error]);
  const durationLabel = (row: LeaveRequestRow) => {
    const pattern = row.status === 'approved' ? row.charged_working_days : workingDaysByUser[row.user_id];
    const working = row.leave_type === 'annual' && !!pattern?.length;
    const days = working ? workingDaysBetween(row.start_date, row.end_date, pattern!) : daysBetween(row.start_date, row.end_date);
    return `${days} ${working ? 'working' : 'calendar'} day${days === 1 ? '' : 's'}`;
  };
  if (!detailsRow) return <Modal open returnFocusTo={returnFocusTo} onClose={onClose} title="Absence details" footer={<Button onClick={onClose}>Close</Button>}><p role="alert">This absence is no longer available.</p></Modal>;
  return <AbsenceDetailsModal supportingHistoryReady={!loading && !error} supportingStatus={error ? <DataLoadError message="Could not refresh absence information. Details shown are from the loaded rota." retry={load} /> : undefined} returnFocusTo={returnFocusTo} detailsRow={detailsRow} setDetailsRow={value => {
    if (value === null) onClose(); else setDetailsRow(value);
  }} requests={requests} workingDaysByUser={workingDaysByUser} durationLabel={durationLabel} updateSickness={updateSickness} />;
}
