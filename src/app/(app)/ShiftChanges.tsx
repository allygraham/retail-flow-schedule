import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { supabase } from '@/integrations/supabase/client';
import { useAsyncData } from '@/hooks/useAsyncData';
import { assertQueryResults } from '@/lib/queryResults';
import { errorMessage } from '@/lib/errors';
import { fmtDate, fmtTime, isoDate } from '@/lib/datetime';
import { ArrowRight, CalendarDays, Check, Circle, Info } from 'lucide-react';
import { Avatar } from '@/components/common/Avatar';
import { Button } from '@/components/common/Button';
import { Field, Select, TextArea } from '@/components/common/Field';
import { Modal } from '@/components/common/Modal';
import { Badge } from '@/components/common/Badge';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { DataLoadError } from '@/components/common/DataLoadError';
import { EmptyState } from '@/components/common/EmptyState';
import { activeChange, needsAcceptance, type ShiftChangeRequest, type ChangeShiftDetails } from '@/features/rota/shiftChangeTypes';
import type { ShiftRow } from '@/types/rows';
import s from './ShiftChanges.module.scss';

const labels = { requested: 'Awaiting manager', proposed: 'Waiting for employees', ready: 'Ready to confirm', completed: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled', expired: 'Expired' };
function ShiftSummary({ shift }: { shift: ChangeShiftDetails }) {
  return <div className={s.shift}><strong>{fmtDate(shift.date, 'EEE d MMM yyyy')}</strong><span>{fmtTime(shift.start)}–{fmtTime(shift.end)} · {shift.store}</span>{shift.role && <span>{shift.role}</span>}</div>;
}
export default function ShiftChanges() {
  const { business, user, role, hasPermission } = useAuth();
  const manager = hasPermission('manage_schedules');
  const [params, setParams] = useSearchParams();
  const history = params.get('view') === 'history';
  const [dialog, setDialog] = useState<'create' | ShiftChangeRequest | null>(null);
  const [sourceId, setSourceId] = useState(params.get('shift') ?? '');
  const [reason, setReason] = useState('');
  const [replacement, setReplacement] = useState('');
  const [swapId, setSwapId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pending = useRef(false);
  const context = `${business?.id}:${user?.id}:${role}`;
  const current = useRef<string | null>(context);
  useEffect(() => { current.current = context; setDialog(null); setProblem(null); setBusy(false); return () => { current.current = null; }; }, [context]);
  const load = useCallback(async () => {
    if (!business || !user) return { requests: [], shifts: [], people: [] };
    const requests = await supabase.rpc('get_shift_change_requests', { _business_id: business.id });
    let query = supabase.from('shifts').select('*').eq('business_id', business.id).eq('is_published', true).neq('status', 'cancelled').gte('shift_date', isoDate(new Date())).order('shift_date').order('start_time').order('id');
    if (!manager) query = query.eq('assigned_user_id', user.id);
    const shifts: { data: ShiftRow[]; error: null } = { data: [], error: null };
    for (let offset = 0; ; offset += 500) {
      const batch = await query.range(offset, offset + 499);
      assertQueryResults(batch); shifts.data.push(...batch.data ?? []);
      if ((batch.data?.length ?? 0) < 500) break;
    }
    const people = manager ? await supabase.rpc('get_rota_people', { _business_id: business.id }) : { data: [], error: null };
    assertQueryResults(requests, shifts, people);
    return { requests: requests.data ?? [], shifts: shifts.data ?? [], people: people.data ?? [] };
  }, [business, user, manager]);
  const { data, loading, error, reload } = useAsyncData(load, 'Could not load shift changes. Please try again.');
  useEffect(() => {
    if (!loading && !error && params.get('shift') && data?.shifts.some(shift => shift.id === params.get('shift') && shift.assigned_user_id === user?.id)) {
      setSourceId(params.get('shift')!); setDialog('create'); setReason(''); setParams({}, { replace: true });
    }
  }, [loading, error, params, data, user?.id, setParams]);
  // Reconcile decisions from colleagues without requiring a page refresh.
  useEffect(() => { const timer = window.setInterval(() => { if (!document.hidden && !pending.current) void reload({ background: true }); }, 30000); return () => window.clearInterval(timer); }, [reload]);
  const act = async (action: string, request?: ShiftChangeRequest) => {
    if (!business || pending.current) return;
    pending.current = true; setBusy(true); setProblem(null);
    try {
      const result = await supabase.rpc('change_shift_request', {
        _business_id: business.id, _action: action, _request_id: request?.id,
        _expected_updated_at: request?.updated_at,
        ...(action === 'create' ? { _shift_id: sourceId, _reason: reason } : {}),
        ...(action === 'propose' ? { _replacement_user_id: replacement, _swap_shift_id: swapId || undefined, _manager_note: note } : {}),
      });
      assertQueryResults(result);
      if (current.current !== context) return;
      setDialog(null); await reload({ background: true });
    } catch (error) { if (current.current === context) { setProblem(errorMessage(error, 'Could not update the request. Please try again.')); void reload({ background: true }); } }
    finally { pending.current = false; if (current.current === context) setBusy(false); }
  };
  const activeRequests = (data?.requests ?? []).filter(activeChange);
  const historyRequests = (data?.requests ?? []).filter(request => !activeChange(request));
  const visibleRequests = history ? historyRequests : activeRequests;
  const ownShifts = (data?.shifts ?? []).filter(shift => shift.assigned_user_id === user?.id && !data?.requests.some(request => activeChange(request) && (request.source.id === shift.id || request.swap?.id === shift.id)));
  const selected = typeof dialog === 'object' ? dialog : null;
  const targetShifts = (data?.shifts ?? []).filter(shift => shift.assigned_user_id === replacement && shift.id !== selected?.source.id);
  const shiftLabel = (shift: ShiftRow) => `${fmtDate(shift.shift_date, 'EEE d MMM')} · ${fmtTime(shift.start_time)}–${fmtTime(shift.end_time)}`;
  return <div className={s.page}>
    <header className={s.header}><div><span className={s.eyebrow}>Rota</span><h1>Shift changes</h1><p>See what changes and who needs to act next.</p></div>{role !== 'admin' && <Button disabled={loading || !!error || !ownShifts.length} onClick={() => { setDialog('create'); setSourceId(ownShifts[0]?.id ?? ''); setReason(''); setProblem(null); }}>Request a shift change</Button>}</header>
    <nav className={s.tabs} aria-label="Shift change views">{[['active', activeRequests.length], ['history', historyRequests.length]].map(([view, count]) => <button key={view} type="button" aria-current={(history ? 'history' : 'active') === view ? 'page' : undefined} onClick={() => setParams(previous => { const next = new URLSearchParams(previous); if (view === 'history') next.set('view', 'history'); else next.delete('view'); return next; })}>{view === 'active' ? 'Active' : 'History'}<span>{loading ? '–' : count}</span></button>)}</nav>
    <div className={s.info}><Info size={18} aria-hidden /><p>Original shifts stay assigned until a manager confirms the change.</p></div>
    {problem && !dialog && <p role="alert">{problem}</p>}
    {error ? <DataLoadError message={error} retry={reload} /> : loading ? <LoadingSkeleton label="Loading shift changes" rows={4} /> : !visibleRequests.length ? <div className={s.empty}><EmptyState title={history ? 'No past shift changes' : 'No active shift changes'} description={history ? 'Confirmed, declined, cancelled and expired changes will appear here.' : 'Requests and proposals will appear here.'} /></div> : <div className={s.list}>{visibleRequests.map(request => {
      const accepting = ['proposed', 'ready'].includes(request.status);
      const waiting = [!request.requester_accepted && request.requester_name, !request.replacement_accepted && request.replacement_name].filter(Boolean).join(' and ');
      const nextAction = request.status === 'requested' ? manager ? 'Choose a colleague and propose cover or a swap.' : 'Your manager will propose cover or a swap.' : request.status === 'ready' ? manager ? 'Both employees have accepted. Review the arrangement and confirm the change.' : 'Both employees have accepted. Waiting for manager confirmation.' : request.status === 'proposed' ? needsAcceptance(request, user?.id ?? '') ? 'Review the arrangement below and accept if it works for you.' : `Waiting for ${waiting}.${manager ? ' You can confirm once both have accepted.' : ' A manager will confirm after both accept.'}` : request.status === 'completed' ? 'This change has been confirmed and the rota updated.' : 'This request is closed. No shift change was made.';
      return <article key={request.id} className={s.request}>
        <div className={s.row}><div className={s.person}><Avatar name={request.requester_name} /><div><h2>{request.requester_id === user?.id ? 'Your shift change' : request.requester_name}</h2><p className={s.caption}>{request.swap ? 'Shift swap' : request.replacement_user_id ? 'Cover request' : 'Shift change request'}</p></div></div><Badge tone={request.status === 'proposed' || request.status === 'ready' ? 'warning' : request.status === 'completed' ? 'success' : 'neutral'}>{labels[request.status]}</Badge></div>
        <div className={s.body}><div className={s.arrangement}><h3>{request.status === 'completed' ? 'Confirmed arrangement' : request.replacement_user_id ? request.swap ? 'Proposed exchange' : 'Proposed handover' : 'Shift to change'}</h3>
          <div className={s.handover}><div className={s.identity}><span className={s.caption}>{request.status === 'completed' ? 'Requested by' : 'Currently assigned'}</span><div className={s.person}><Avatar name={request.requester_name} size="sm" /><strong>{request.requester_name}</strong></div></div>{request.replacement_user_id && <><ArrowRight className={s.arrow} size={22} aria-hidden /><div className={s.identity}><span className={s.caption}>{request.status === 'completed' ? 'Confirmed colleague' : request.swap ? 'Swap with' : 'Proposed cover'}</span><div className={s.person}><Avatar name={request.replacement_name} size="sm" /><strong>{request.replacement_name}</strong></div></div></>}</div>
          <div className={s.date}><CalendarDays size={22} aria-hidden /><div>{request.swap && <span className={s.caption}>{request.replacement_name} takes this shift</span>}<ShiftSummary shift={request.source} /></div></div>
          {request.swap && <div className={s.date}><CalendarDays size={22} aria-hidden /><div><span className={s.caption}>{request.requester_name} takes this shift</span><ShiftSummary shift={request.swap} /></div></div>}
        </div>{accepting && <div className={s.acceptance}><h3>Acceptance progress</h3>{[[request.requester_name,request.requester_accepted],[request.replacement_name,request.replacement_accepted]].map(([name,accepted],index) => <div key={index} className={s.progressItem}>{accepted ? <Check size={20} className={s.accepted} aria-hidden /> : <Circle size={20} aria-hidden />}<div><strong>{name}</strong><span>{accepted ? 'Accepted' : 'Awaiting acceptance'}</span></div></div>)}<div className={s.progressItem}><Circle size={20} aria-hidden /><div><strong>Manager confirmation</strong><span>{request.status === 'ready' ? 'Ready to confirm' : 'After both accept'}</span></div></div></div>}</div>
        <p className={s.next}>{nextAction}</p>
        {(request.reason || request.manager_note) && <details className={s.details}><summary>Request details</summary>{request.reason && <div><strong>Reason for request</strong><p className={s.reason}>{request.reason}</p></div>}{request.manager_note && <div><strong>Internal manager note</strong><p className={s.reason}>{request.manager_note}</p></div>}</details>}
        {request.warnings?.length > 0 && <div role="note" className={s.warning}><strong>Check before confirming</strong>{request.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
        <div className={s.actions}>
          {needsAcceptance(request, user?.id ?? '') && <Button disabled={busy} onClick={() => void act('accept', request)}>Accept proposal</Button>}
          {manager && request.status === 'ready' && <Button disabled={busy} onClick={() => void act('confirm', request)}>Confirm change</Button>}
          {manager && activeChange(request) && <Button variant="outline" disabled={busy} onClick={() => { setDialog(request); setReplacement(request.replacement_user_id ?? ''); setSwapId(request.swap?.id ?? ''); setNote(request.manager_note ?? ''); setProblem(null); }}>{request.replacement_user_id ? 'Change proposal' : 'Propose cover or swap'}</Button>}
          {activeChange(request) && (manager || request.replacement_user_id === user?.id || request.requester_id === user?.id && request.status !== 'requested') && <Button variant="ghost" disabled={busy} onClick={() => void act('decline', request)}>Decline</Button>}
          {activeChange(request) && request.requester_id === user?.id && <Button variant="ghost" disabled={busy} onClick={() => void act('cancel', request)}>Cancel request</Button>}
        </div>
      </article>;
    })}</div>}
    <Modal open={!!dialog} onClose={() => { if (!busy) setDialog(null); }} title={dialog === 'create' ? 'Request a shift change' : 'Propose cover or a swap'} footer={<><Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button loading={busy} disabled={dialog === 'create' ? !sourceId || !reason.trim() : !replacement} onClick={() => void act(dialog === 'create' ? 'create' : 'propose', selected ?? undefined)}>{dialog === 'create' ? 'Send request' : 'Send proposal'}</Button></>}>
      <div className={s.form}>{dialog === 'create' ? <><Field label="Your shift"><Select value={sourceId} disabled={busy} onChange={event => setSourceId(event.target.value)}><option value="">Choose a shift</option>{ownShifts.map(shift => <option key={shift.id} value={shift.id}>{shiftLabel(shift)}</option>)}</Select></Field><Field label="What change do you need?" hint="Include when you could work instead. Only management can see this message."><TextArea value={reason} maxLength={1000} disabled={busy} onChange={event => setReason(event.target.value)} /></Field></> : <>
        {selected && <ShiftSummary shift={selected.source} />}
        <Field label="Colleague"><Select value={replacement} disabled={busy} onChange={event => { setReplacement(event.target.value); setSwapId(''); }}><option value="">Choose a colleague</option>{(data?.people ?? []).filter(person => person.user_id !== selected?.requester_id).map(person => <option key={person.user_id} value={person.user_id}>{person.full_name}</option>)}</Select></Field>
        <Field label="Arrangement"><Select value={swapId} disabled={busy || !replacement} onChange={event => setSwapId(event.target.value)}><option value="">Cover only · no shift in return</option>{targetShifts.map(shift => <option key={shift.id} value={shift.id}>Swap for {shiftLabel(shift)}</option>)}</Select></Field>
        <Field label="Internal manager note" hint="Visible to management only."><TextArea value={note} maxLength={1000} disabled={busy} onChange={event => setNote(event.target.value)} /></Field>
        <p className={s.explainer}>Check contracted hours and rest periods in the rota before proposing. Store and role eligibility are checked; leave, availability and overlaps are rechecked when confirming.</p>
      </>}{problem && <p role="alert">{problem}</p>}</div>
    </Modal>
  </div>;
}
