import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Avatar } from '@/components/common/Avatar';
import { Modal } from '@/components/common/Modal';
import { Field, Input, Select, TextArea } from '@/components/common/Field';
import { EmptyState } from '@/components/common/EmptyState';
import { fmtDate, isoDate } from '@/lib/datetime';
import { leaveSchema } from '@/lib/validation';
import s from './Leave.module.scss';

const TONE: Record<string, any> = { pending: 'pending', approved: 'success', rejected: 'danger', cancelled: 'neutral' };

export default function Leave() {
  const { business, role, user } = useAuth();
  const isMgr = role === 'owner' || role === 'manager';
  const [requests, setRequests] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<any>({ leave_type: 'annual', start_date: isoDate(new Date()), end_date: isoDate(new Date()), reason: '' });
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    if (!business) return;
    let q = supabase.from('leave_requests')
      .select('*, profiles!leave_requests_user_id_fkey(full_name)')
      .eq('business_id', business.id).order('created_at', { ascending: false });
    if (!isMgr) q = q.eq('user_id', user!.id);
    const { data } = await q;
    setRequests(data ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [business, role]);

  const submit = async () => {
    setErr(null);
    const parsed = leaveSchema.safeParse(form);
    if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
    const { error } = await supabase.from('leave_requests').insert({
      ...parsed.data, business_id: business!.id, user_id: user!.id,
    } as any);
    if (error) { setErr(error.message); return; }
    setModal(false); setForm({ leave_type: 'annual', start_date: isoDate(new Date()), end_date: isoDate(new Date()), reason: '' });
    load();
  };

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    await supabase.from('leave_requests').update({ status, reviewed_by: user!.id, reviewed_at: new Date().toISOString() }).eq('id', id);
    load();
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <span className={s.eye}>Leave</span>
          <h1 className={s.h1}>{isMgr ? 'Leave & sickness' : 'My time off'}</h1>
        </div>
        <Button onClick={() => setModal(true)}>Request time off</Button>
      </header>

      <Card padded={false}>
        {requests.length === 0 ? (
          <EmptyState title="Nothing here yet" description="Submit a request to get started." />
        ) : (
          <table className={s.table}>
            <thead><tr>
              {isMgr && <th>Employee</th>}
              <th>Type</th><th>Dates</th><th>Reason</th><th>Status</th>{isMgr && <th></th>}
            </tr></thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id}>
                  {isMgr && <td><div className={s.who}><Avatar name={r.profiles?.full_name} size="sm" /><span>{r.profiles?.full_name ?? 'Employee'}</span></div></td>}
                  <td><Badge tone={r.leave_type === 'sick' ? 'sick' : r.leave_type === 'annual' ? 'leave' : 'neutral'}>{r.leave_type}</Badge></td>
                  <td className={s.dates}>{fmtDate(r.start_date, 'd MMM')} → {fmtDate(r.end_date, 'd MMM yyyy')}</td>
                  <td className={s.reason}>{r.reason ?? '—'}</td>
                  <td><Badge tone={TONE[r.status]} dot>{r.status}</Badge></td>
                  {isMgr && <td className={s.actions}>
                    {r.status === 'pending' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => decide(r.id, 'rejected')}>Reject</Button>
                        <Button size="sm" onClick={() => decide(r.id, 'approved')}>Approve</Button>
                      </>
                    )}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Request time off"
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button><Button onClick={submit}>Submit</Button></>}>
        <div className={s.form}>
          <Field label="Type">
            <Select value={form.leave_type} onChange={e => setForm({...form, leave_type: e.target.value})}>
              <option value="annual">Annual leave</option>
              <option value="unpaid">Unpaid</option>
              <option value="sick">Sick</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <div className={s.row2}>
            <Field label="From"><Input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})}/></Field>
            <Field label="To"><Input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})}/></Field>
          </div>
          <Field label="Reason"><TextArea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="Optional context for your manager"/></Field>
          {err && <div className={s.err}>{err}</div>}
        </div>
      </Modal>
    </div>
  );
}
