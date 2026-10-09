import { useCallback, useState } from 'react';
import { useAuth } from '@/features/auth/authContext';
import { supabase } from '@/integrations/supabase/client';
import { useAsyncData } from '@/hooks/useAsyncData';
import { assertQueryResults } from '@/lib/queryResults';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { DataLoadError } from '@/components/common/DataLoadError';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/common/Button';
import { Field, Select, Input } from '@/components/common/Field';
import { DatePicker, parseISODate, toISODate } from '@/components/common/DatePicker';
import s from './ChangeHistory.module.scss';
const entities: Record<string, string> = { shift_change_requests: 'Shift change request', shifts: 'Shift', rota_week_publications: 'Rota publication', leave_requests: 'Leave / absence', user_roles: 'Access role', memberships: 'Membership', employee_profiles: 'Employment details', store_locations: 'Store', roles_catalog: 'Job role', businesses: 'Business settings', business_branding: 'Branding', custom_holidays: 'Company holiday', invitations: 'Invitation' };
function display(value: unknown) { return value == null ? '—' : Array.isArray(value) ? value.join(', ') : String(value); }
export default function ChangeHistory() {
  const { business, hasPermission } = useAuth();
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const allowed = hasPermission('view_change_history');
  const fetch = useCallback(async () => {
    if (!business || !allowed) throw new Error('Access denied');
    let query = supabase.from('change_events').select('*').eq('business_id', business.id).order('occurred_at', { ascending: false }).order('id', { ascending: false });
    if (entity) query = query.eq('entity_type', entity);
    if (action) query = query.eq('action', action);
    if (actor.trim()) query = query.ilike('actor_name', `%${actor.trim().replace(/[%_\\]/g, '\\$&')}%`);
    if (from) query = query.gte('occurred_at', parseISODate(from)!.toISOString());
    if (to) { const end = parseISODate(to)!; end.setDate(end.getDate() + 1); query = query.lt('occurred_at', end.toISOString()); }
    const result = await query.range(page * 50, page * 50 + 50);
    assertQueryResults(result); return result.data ?? [];
  }, [business, allowed, entity, action, actor, from, to, page]);
  const { data, loading, error, reload } = useAsyncData(fetch, 'Could not load change history. Please try again.');
  const rows = loading ? [] : (data ?? []).slice(0, 50);
  return <div className={s.page}>
    <header className={s.header}><div><span className={s.eyebrow}>Business records</span><h1>Change history</h1><p>Who changed what, and when. History starts when tracking is enabled.</p></div><Button variant="outline" disabled={loading} onClick={() => { if (page) setPage(0); else void reload(); }}>Refresh</Button></header>
    <div className={s.filters}>
      <Field label="Area"><Select value={entity} onChange={e => { setEntity(e.target.value); setPage(0); }}><option value="">All areas</option>{Object.entries(entities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
      <Field label="Action"><Select value={action} onChange={e => { setAction(e.target.value); setPage(0); }}><option value="">All actions</option><option value="created">Created</option><option value="updated">Updated</option><option value="deleted">Deleted</option></Select></Field>
      <Field label="Changed by"><Input value={actor} onChange={e => { setActor(e.target.value); setPage(0); }} placeholder="Search name" /></Field>
      <Field label="From date"><DatePicker value={parseISODate(from)} onChange={date => { setFrom(date ? toISODate(date) : ''); setPage(0); }} /></Field>
      <Field label="To date"><DatePicker value={parseISODate(to)} onChange={date => { setTo(date ? toISODate(date) : ''); setPage(0); }} /></Field>
    </div>
    <section className={s.records} aria-label="Change records">
      {error ? <DataLoadError message={error} retry={reload} /> : loading ? <LoadingSkeleton label="Loading history" /> : !rows.length ? <EmptyState title="No changes recorded" description="Changes will appear here as people update your business." /> : rows.map(row => <article className={s.record} key={row.id}>
        <div className={s.recordHead}><strong>{entities[row.entity_type] ?? row.entity_type} {row.action}</strong><time dateTime={row.occurred_at}>{new Date(row.occurred_at).toLocaleString('en-GB')}</time></div>
        <p>{row.actor_name}{row.subject ? ` · ${row.subject}` : ''}</p>
        <details><summary>View changes</summary><div className={s.changes}>{Object.keys({ ...Object(row.before_values), ...Object(row.after_values) }).map(key => <div key={key}><strong>{key.replace(/_/g, ' ')}</strong><span>{display(Object(row.before_values)[key])} → {display(Object(row.after_values)[key])}</span></div>)}</div></details>
      </article>)}
    </section>
    <div className={s.pagination}><Button variant="outline" disabled={loading || page === 0} onClick={() => setPage(page - 1)}>Newer</Button><span>Page {page + 1}</span><Button variant="outline" disabled={loading || (data?.length ?? 0) <= 50} onClick={() => setPage(page + 1)}>Older</Button></div>
  </div>;
}
