import { useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLeaveRequests, type LeaveRequestRow } from '@/features/leave/useLeaveRequests';
import { STATUS_LABEL, STATUS_TONE, TYPE_LABEL, TYPE_TONE } from '@/features/leave/leaveStatus';
import { useLeaveBalance, daysBetween } from '@/features/leave/useLeaveBalance';
import { LeaveBalanceCard } from '@/features/leave/LeaveBalanceCard';
import { LeaveBalanceInline } from '@/features/leave/LeaveBalanceInline';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Avatar } from '@/components/common/Avatar';
import { Modal } from '@/components/common/Modal';
import { Field, Input, Select, TextArea } from '@/components/common/Field';
import { DatePicker, parseISODate, toISODate } from '@/components/common/DatePicker';
import { EmptyState } from '@/components/common/EmptyState';
import { fmtDate, isoDate } from '@/lib/datetime';
import { leaveSchema } from '@/lib/validation';
import { toast } from 'sonner';
import s from './Leave.module.scss';

type Filter = 'pending' | 'reviewed' | 'all';

export default function Leave() {
  const { user } = useAuth();
  const { requests, loading, isMgr, submit, cancelOwn, review } = useLeaveRequests();
  const { balance, loading: balanceLoading, reload: reloadBalance } = useLeaveBalance();

  const [requestModal, setRequestModal] = useState(false);
  const [form, setForm] = useState<any>({
    leave_type: 'annual',
    start_date: isoDate(new Date()),
    end_date: isoDate(new Date()),
    reason: '',
  });
  const [formErr, setFormErr] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{ row: LeaveRequestRow; action: 'approved' | 'rejected' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const [filter, setFilter] = useState<Filter>('pending');

  const filtered = useMemo(() => {
    if (!isMgr) return requests; // employees see everything chronologically
    if (filter === 'pending') return requests.filter(r => r.status === 'pending');
    if (filter === 'reviewed') return requests.filter(r => r.status === 'approved' || r.status === 'rejected');
    return requests;
  }, [requests, filter, isMgr]);

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const submitRequest = async () => {
    setFormErr(null);
    const parsed = leaveSchema.safeParse(form);
    if (!parsed.success) { setFormErr(parsed.error.issues[0].message); return; }
    // Soft warn if annual leave exceeds remaining balance.
    if (parsed.data.leave_type === 'annual' && balance) {
      const days = daysBetween(parsed.data.start_date, parsed.data.end_date);
      if (days > balance.remaining) {
        const ok = window.confirm(
          `This request is ${days} day${days === 1 ? '' : 's'} but you only have ${balance.remaining} day${balance.remaining === 1 ? '' : 's'} of annual leave remaining. Submit anyway?`
        );
        if (!ok) return;
      }
    }
    try {
      await submit(parsed.data);
      setRequestModal(false);
      setForm({ leave_type: 'annual', start_date: isoDate(new Date()), end_date: isoDate(new Date()), reason: '' });
      toast.success('Request submitted. Your manager has been notified.');
      reloadBalance();
    } catch (e: any) {
      setFormErr(e.message ?? 'Could not submit');
    }
  };

  const openReview = (row: LeaveRequestRow, action: 'approved' | 'rejected') => {
    setReviewing({ row, action });
    setReviewNote('');
  };
  const confirmReview = async () => {
    if (!reviewing) return;
    try {
      await review({ id: reviewing.row.id, status: reviewing.action, review_notes: reviewNote.trim() || null });
      const verb = reviewing.action === 'approved' ? 'Approved' : 'Declined';
      toast.success(
        reviewing.action === 'approved'
          ? `${verb} — any clashing shifts were unassigned.`
          : verb,
      );
      setReviewing(null);
      reloadBalance();
    } catch (e: any) {
      toast.error(e.message ?? 'Could not save decision');
    }
  };

  const cancel = async (id: string) => {
    toast('Cancel this request?', {
      action: { label: 'Cancel request', onClick: async () => {
        try { await cancelOwn(id); toast.success('Request cancelled'); }
        catch (e: any) { toast.error(e.message ?? 'Could not cancel'); }
      }},
      cancel: { label: 'Keep', onClick: () => {} },
    });
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <span className={s.eye}>Leave</span>
          <h1 className={s.h1}>{isMgr ? 'Leave & sickness' : 'My time off'}</h1>
          {isMgr && pendingCount > 0 && (
            <p className={s.sub}>
              <Badge tone="pending" dot>{pendingCount} pending</Badge> awaiting your review
            </p>
          )}
        </div>
        <Button onClick={() => setRequestModal(true)}>Request time off</Button>
      </header>

      {!isMgr && (
        <LeaveBalanceCard balance={balance} loading={balanceLoading} />
      )}

      {isMgr && (
        <div className={s.tabs} role="tablist">
          {(['pending','reviewed','all'] as Filter[]).map(f => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={`${s.tab} ${filter === f ? s.tabActive : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'pending' ? `Pending (${pendingCount})` : f === 'reviewed' ? 'Reviewed' : 'All'}
            </button>
          ))}
        </div>
      )}

      <Card padded={false}>
        {loading ? (
          <div className={s.loading}>Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={isMgr && filter === 'pending' ? 'All caught up' : 'Nothing here yet'}
            description={isMgr && filter === 'pending'
              ? 'No requests are waiting for review.'
              : 'Submit a request to get started.'}
          />
        ) : (
          <table className={s.table}>
            <thead>
              <tr>
                {isMgr && <th>Employee</th>}
                {isMgr && <th>Store</th>}
                <th>Type</th>
                <th>Dates</th>
                <th>Reason</th>
                <th>Submitted</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const isOwn = r.user_id === user?.id;
                return (
                  <tr key={r.id}>
                    {isMgr && (
                      <td>
                        <div className={s.who}>
                          <Avatar name={r.profiles?.full_name ?? undefined} size="sm" />
                          <span>{r.profiles?.full_name ?? 'Employee'}</span>
                        </div>
                      </td>
                    )}
                    {isMgr && <td className={s.muted}>{r.primary_store?.name ?? '—'}</td>}
                    <td>
                      <Badge tone={TYPE_TONE[r.leave_type]}>{TYPE_LABEL[r.leave_type]}</Badge>
                    </td>
                    <td className={s.dates}>
                      {fmtDate(r.start_date, 'd MMM')} → {fmtDate(r.end_date, 'd MMM yyyy')}
                    </td>
                    <td className={s.reason} title={r.reason ?? undefined}>{r.reason ?? '—'}</td>
                    <td className={s.muted}>{fmtDate(r.created_at, 'd MMM')}</td>
                    <td>
                      <div className={s.statusCell}>
                        <Badge tone={STATUS_TONE[r.status]} dot>{STATUS_LABEL[r.status]}</Badge>
                        {r.review_notes && (r.status === 'approved' || r.status === 'rejected') && (
                          <span className={s.note} title={r.review_notes}>Note</span>
                        )}
                      </div>
                    </td>
                    <td className={s.actions}>
                      {isMgr && r.status === 'pending' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openReview(r, 'rejected')}>Decline</Button>
                          <Button size="sm" onClick={() => openReview(r, 'approved')}>Approve</Button>
                        </>
                      )}
                      {!isMgr && isOwn && r.status === 'pending' && (
                        <Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>Cancel</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Request modal */}
      <Modal
        open={requestModal}
        onClose={() => setRequestModal(false)}
        title="Request time off"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRequestModal(false)}>Cancel</Button>
            <Button onClick={submitRequest}>Submit</Button>
          </>
        }
      >
        <div className={s.form}>
          <Field label="Type">
            <Select value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })}>
              <option value="annual">Annual leave</option>
              <option value="unpaid">Unpaid</option>
              <option value="sick">Sick</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Dates">
            <DatePicker
              mode="range"
              value={{ from: parseISODate(form.start_date), to: parseISODate(form.end_date) }}
              onChange={(r) => setForm({
                ...form,
                start_date: toISODate(r.from) || form.start_date,
                end_date: toISODate(r.to) || toISODate(r.from) || form.end_date,
              })}
              placeholder="Pick a date range"
            />
          </Field>
          <Field label="Reason">
            <TextArea
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="Optional context for your manager"
              rows={3}
            />
          </Field>
          {formErr && <div className={s.err}>{formErr}</div>}
        </div>
      </Modal>

      {/* Review modal */}
      <Modal
        open={!!reviewing}
        onClose={() => setReviewing(null)}
        title={reviewing?.action === 'approved' ? 'Approve request' : 'Decline request'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button
              variant={reviewing?.action === 'approved' ? 'primary' : 'danger'}
              onClick={confirmReview}
            >
              {reviewing?.action === 'approved' ? 'Approve' : 'Decline'}
            </Button>
          </>
        }
      >
        {reviewing && (
          <div className={s.form}>
            <div className={s.reviewSummary}>
              <Avatar name={reviewing.row.profiles?.full_name ?? undefined} size="sm" />
              <div>
                <div className={s.reviewName}>{reviewing.row.profiles?.full_name ?? 'Employee'}</div>
                <div className={s.muted}>
                  {TYPE_LABEL[reviewing.row.leave_type]} ·{' '}
                  {fmtDate(reviewing.row.start_date, 'd MMM')} → {fmtDate(reviewing.row.end_date, 'd MMM yyyy')}
                </div>
              </div>
            </div>
            {reviewing.row.leave_type === 'annual' && (
              <LeaveBalanceInline
                userId={reviewing.row.user_id}
                pendingDays={daysBetween(reviewing.row.start_date, reviewing.row.end_date)}
              />
            )}
            {reviewing.row.reason && (
              <div className={s.reviewReason}>
                <span className={s.reasonLabel}>Reason</span>
                <p>{reviewing.row.reason}</p>
              </div>
            )}
            <Field
              label="Note to employee (optional)"
              hint={reviewing.action === 'approved'
                ? 'Approving will unassign any of their shifts in this date range.'
                : 'Briefly explain your decision so the employee has context.'}
            >
              <TextArea
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={reviewing.action === 'approved' ? 'Enjoy your time off!' : 'Sorry — store is short-staffed that week.'}
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
