import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLeaveRequests } from '@/features/leave/useLeaveRequests';
import { Card } from '@/components/common/Card';
import { Avatar } from '@/components/common/Avatar';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Field, Input, Select, TextArea } from '@/components/common/Field';
import { Modal } from '@/components/common/Modal';
import { DatePicker, parseISODate, toISODate } from '@/components/common/DatePicker';
import { fmtDate, fmtTime, isoDate } from '@/lib/datetime';
import { useLeaveBalance } from '@/features/leave/useLeaveBalance';
import { LeaveBalanceCard } from '@/features/leave/LeaveBalanceCard';
import { useHolidays } from '@/features/holidays/useHolidays';
import { leaveSchema } from '@/lib/validation';
import { toast } from 'sonner';
import s from './Profile.module.scss';

export default function Profile() {
  const { user, fullName, role, business, refresh } = useAuth();
  const { balance, loading: balanceLoading } = useLeaveBalance();
  const { submit } = useLeaveRequests();
  const [name, setName] = useState(fullName ?? '');
  const holidays = useHolidays();
  const [phone, setPhone] = useState('');
  const [shifts, setShifts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [requestModal, setRequestModal] = useState(false);
  const [collapsible, setCollapsible] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 899px)');
    const apply = () => setCollapsible(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestForm, setRequestForm] = useState({
    leave_type: 'annual',
    start_date: isoDate(new Date()),
    end_date: isoDate(new Date()),
    reason: '',
  });

  useEffect(() => { setName(fullName ?? ''); }, [fullName]);

  useEffect(() => {
    if (!user || !business) return;
    (async () => {
      const today = isoDate(new Date());
      const [{ data: prof }, { data: sh }] = await Promise.all([
        supabase.from('profiles').select('phone').eq('id', user.id).maybeSingle(),
        supabase.from('shifts').select('*, store_locations(name), roles_catalog(name)').eq('assigned_user_id', user.id).gte('shift_date', today).eq('is_published', true).order('shift_date').limit(10),
      ]);
      setPhone(prof?.phone ?? '');
      setShifts(sh ?? []);
    })();
  }, [user, business]);

  const save = async () => {
    setSaving(true);
    await supabase.from('profiles').update({ full_name: name, phone }).eq('id', user!.id);
    setSaving(false);
    refresh();
  };

  const openRequestModal = () => {
    setRequestError(null);
    setRequestForm({
      leave_type: 'annual',
      start_date: isoDate(new Date()),
      end_date: isoDate(new Date()),
      reason: '',
    });
    setRequestModal(true);
  };

  const submitRequest = async () => {
    setRequestError(null);
    const parsed = leaveSchema.safeParse(requestForm);
    if (!parsed.success) {
      setRequestError(parsed.error.issues[0]?.message ?? 'Check your request details');
      return;
    }

    try {
      setRequesting(true);
      await submit(parsed.data);
      setRequestModal(false);
      toast.success('Request submitted. Your manager has been notified.');
    } catch (error: any) {
      setRequestError(error.message ?? 'Could not submit request');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className={s.page}>
      <header className={s.header}><div><span className={s.eye}>My profile</span><h1 className={s.h1}>Your details</h1></div></header>
      <div className={s.grid}>
        <Card title="Personal info">
          <div className={s.who}>
            <Avatar name={name} size="lg" />
            <div>
              <div className={s.name}>{name || 'You'}</div>
              <div className={s.role}><Badge tone="brand" dot>{role ?? '—'}</Badge> at {business?.name}</div>
            </div>
          </div>
          {collapsible && (
            <button
              type="button"
              className={`${s.formToggle} border-neutral-100 bg-neutral-50`}
              aria-expanded={formOpen}
              onClick={() => setFormOpen(o => !o)}
            >
              <span>Edit details</span>
              <ChevronDown size={16} className={formOpen ? s.chevOpen : ''} />
            </button>
          )}
          {(!collapsible || formOpen) && (
            <div className={s.form}>
              <Field label="Full name"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
              <Field label="Phone"><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" /></Field>
              <Button onClick={save} loading={saving}>Save changes</Button>
            </div>
          )}
        </Card>
        <div className={s.col}>
          <LeaveBalanceCard
            balance={balance}
            loading={balanceLoading}
            action={<Button onClick={openRequestModal}>Request time off</Button>}
          />
        <Card title="Upcoming shifts" subtitle="Next 10 published">
          {shifts.length === 0 ? (
            <div className={s.empty}>No upcoming shifts.</div>
          ) : (
            <ul className={s.list}>
              {shifts.map((sh: any) => {
                const hol = holidays.get(sh.shift_date);
                return (
                  <li key={sh.id} className={s.row}>
                    <div className={s.date}>
                      <div className={s.dDay}>{fmtDate(sh.shift_date, 'EEE')}</div>
                      <div className={s.dNum}>{fmtDate(sh.shift_date, 'd')}</div>
                    </div>
                    <div className={s.rowMain}>
                      <div className={s.rowName}>
                        {fmtTime(sh.start_time)} – {fmtTime(sh.end_time)}
                        {hol && <Badge tone="warning" dot>{hol.name}</Badge>}
                      </div>
                      <div className={s.rowMeta}>{sh.store_locations?.name} · {sh.roles_catalog?.name ?? 'Floor'}{sh.notes ? ` · ${sh.notes}` : ''}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        </div>
      </div>

      <Modal
        open={requestModal}
        onClose={() => setRequestModal(false)}
        title="Request time off"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRequestModal(false)}>Cancel</Button>
            <Button onClick={submitRequest} loading={requesting}>Submit</Button>
          </>
        }
      >
        <div className={s.requestForm}>
          <Field label="Type">
            <Select value={requestForm.leave_type} onChange={(event) => setRequestForm((current) => ({ ...current, leave_type: event.target.value as typeof current.leave_type }))}>
              <option value="annual">Annual leave</option>
              <option value="unpaid">Unpaid</option>
              <option value="sick">Sick</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Dates">
            <DatePicker
              mode="range"
              value={{ from: parseISODate(requestForm.start_date), to: parseISODate(requestForm.end_date) }}
              onChange={(range) => setRequestForm((current) => ({
                ...current,
                start_date: toISODate(range.from) || current.start_date,
                end_date: toISODate(range.to) || toISODate(range.from) || current.end_date,
              }))}
              placeholder="Pick a date range"
            />
          </Field>
          <Field label="Reason">
            <TextArea
              value={requestForm.reason}
              onChange={(event) => setRequestForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder="Optional context for your manager"
              rows={3}
            />
          </Field>
          {requestError && <div className={s.requestError}>{requestError}</div>}
        </div>
      </Modal>
    </div>
  );
}
