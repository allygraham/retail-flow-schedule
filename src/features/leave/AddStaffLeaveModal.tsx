import { useRef, useState } from 'react';
import { useAuth } from '@/features/auth/authContext';
import { recordEmployeeLeave } from './leaveMutations';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { Field, Input, Select, TextArea } from '@/components/common/Field';
import { DatePicker, parseISODate, toISODate } from '@/components/common/DatePicker';
import { isoDate } from '@/lib/datetime';
import { errorMessage } from '@/lib/errors';
import { toast } from 'sonner';
import s from '@/app/(app)/Leave.module.scss';

export function AddStaffLeaveModal({ userId, name, onClose, onSaved }: { userId: string; name: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { business, hasPermission } = useAuth();
  const today = isoDate(new Date());
  const [form, setForm] = useState({ leave_type: 'sick' as 'annual' | 'sick' | 'unpaid', start_date: today, end_date: today, reason: '', manager_note: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const save = async () => {
    if (!business || !hasPermission('manage_leave') || busy.current) return;
    if (!form.start_date || !form.end_date || form.end_date < form.start_date) { setError('Choose a valid date range.'); return; }
    busy.current = true; setSaving(true); setError(null);
    try {
      const result = await recordEmployeeLeave(business.id, { user_id: userId, ...form, reason: form.reason || null, manager_note: form.manager_note || null });
      toast.success(result.released_shift_count > 0 ? `Leave saved — ${result.released_shift_count} shift${result.released_shift_count === 1 ? '' : 's'} reopened for cover.` : 'Leave saved');
      onClose();
      await onSaved();
    } catch (error) { setError(errorMessage(error, 'Could not save leave')); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Modal open onClose={() => { if (!busy.current) onClose(); }} title={`Add leave for ${name}`} footer={<><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save as approved</Button></>}>
    <div className={s.form}>
      <div className={s.row2}>
        <Field label="Leave type"><Select disabled={saving} value={form.leave_type} onChange={event => setForm({ ...form, leave_type: event.target.value as typeof form.leave_type })}><option value="sick">Sick leave</option><option value="annual">Annual leave</option><option value="unpaid">Unpaid leave</option></Select></Field>
        <Field label="Status"><Input value="Approved / recorded" disabled readOnly /></Field>
      </div>
      <Field label="Dates"><DatePicker disabled={saving} mode="range" value={{ from: parseISODate(form.start_date), to: parseISODate(form.end_date) }} onChange={range => setForm({ ...form, start_date: toISODate(range.from) || '', end_date: toISODate(range.to) || toISODate(range.from) || '' })} placeholder="Pick a date range" /></Field>
      <Field label="Reason" hint="Visible in the employee leave history"><TextArea disabled={saving} rows={3} value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} /></Field>
      <Field label="Manager note" hint="Optional internal context"><TextArea disabled={saving} rows={3} value={form.manager_note} onChange={event => setForm({ ...form, manager_note: event.target.value })} /></Field>
      {error && <div role="alert" className={s.err}>{error}</div>}
    </div>
  </Modal>;
}
