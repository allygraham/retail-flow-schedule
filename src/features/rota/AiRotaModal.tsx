import { errorMessage } from '@/lib/errors';
import type { Tables } from '@/integrations/supabase/types';
import type { RotaPerson, ShiftRow } from '@/types/rows';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { Field, Select, TextArea } from '@/components/common/Field';
import { fmtDate, isoDate } from '@/lib/datetime';
import { toast } from 'sonner';

interface Suggestion {
  shift_date: string; start_time: string; end_time: string;
  role_id: string | null; assigned_user_id: string | null;
  break_minutes: number; reason: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  businessId: string;
  userId?: string;
  weekStart: Date;
  days: Date[];
  defaultStoreId: string | null;
  stores: Tables<'store_locations'>[];
  roles: Tables<'roles_catalog'>[];
  people: RotaPerson[];
  leave: Tables<'leave_requests'>[];
  shifts: ShiftRow[];
}

const EXAMPLE = 'e.g. Mon–Fri 09:00–17:30: 2 Floor staff + 1 Keyholder. Sat 09:00–18:00: 3 Floor staff, 1 Cashier, 1 Supervisor. Sun 10:00–16:00: 2 staff incl. a Keyholder.';

export function AiRotaModal(p: Props) {
  const [storeId, setStoreId] = useState<string>(p.defaultStoreId ?? p.stores[0]?.id ?? '');
  const [needs, setNeeds] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ summary: string; shifts: Suggestion[] } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (p.open) { setStoreId(p.defaultStoreId ?? p.stores[0]?.id ?? ''); setResult(null); setError(null); }
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps

  const roleName = (id: string | null) => p.roles.find(r => r.id === id)?.name ?? 'Any role';
  const personName = (id: string | null) => id ? (p.people.find(x => x.user_id === id)?.name ?? 'Unknown') : 'Open shift';

  const generate = async () => {
    if (!storeId || needs.trim().length < 5) { setError('Choose a store and describe your staffing needs.'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const staff = p.people.filter(x => x.store_ids?.includes(storeId));
      const ids = staff.map(x => x.user_id);
      const [ep, av] = await Promise.all([
        ids.length ? supabase.from('employee_profiles').select('user_id, contracted_hours').eq('business_id', p.businessId).in('user_id', ids) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from('availability').select('user_id, day_of_week, unavailable_date, start_time, end_time, is_recurring').eq('business_id', p.businessId).in('user_id', ids) : Promise.resolve({ data: [] }),
      ]);
      const hours = Object.fromEntries((ep.data ?? []).map((e) => [e.user_id, e.contracted_hours]));
      const start = isoDate(p.days[0]), end = isoDate(p.days[6]);
      const unavailable = [
        ...p.leave.filter(l => ids.includes(l.user_id)).map(l => ({ user_id: l.user_id, type: `leave (${l.status})`, from: l.start_date, to: l.end_date })),
        ...((av.data ?? [])).filter(a => !a.unavailable_date || (a.unavailable_date >= start && a.unavailable_date <= end))
          .map(a => ({ user_id: a.user_id, type: 'availability', day_of_week: a.day_of_week, date: a.unavailable_date, start: a.start_time, end: a.end_time })),
      ];
      const { data, error: fnErr } = await supabase.functions.invoke('suggest-rota', {
        body: {
          business_id: p.businessId,
          store: { id: storeId, name: p.stores.find(s => s.id === storeId)?.name },
          week_start: start,
          days: p.days.map(d => ({ date: isoDate(d), weekday: fmtDate(d, 'EEEE') })),
          needs: needs.trim(),
          roles: p.roles.map(r => ({ id: r.id, name: r.name })),
          employees: staff.map(x => ({
            user_id: x.user_id, name: x.name,
            primary_role: roleName(x.primary_role_id), primary_role_id: x.primary_role_id,
            contracted_hours: hours[x.user_id] ?? null,
          })),
          unavailable,
          existing_shifts: p.shifts.filter(s => s.store_id === storeId).map(s => ({
            date: s.shift_date, start: s.start_time, end: s.end_time, role_id: s.role_id, user_id: s.assigned_user_id,
          })),
        },
      });
      if (fnErr) {
        let msg = fnErr.message;
        try { const b = await (fnErr.context as Response | undefined)?.json?.(); if (b?.error) msg = b.error; } catch { /* keep */ }
        throw new Error(msg);
      }
      const validRoles = new Set(p.roles.map(r => r.id));
      const validPeople = new Set(ids);
      const validDays = new Set(p.days.map(d => isoDate(d)));
      const clean: Suggestion[] = (data?.shifts ?? [])
        .filter((s: Suggestion) => validDays.has(s.shift_date) && /^\d{2}:\d{2}/.test(s.start_time) && /^\d{2}:\d{2}/.test(s.end_time))
        .map((s: Suggestion) => ({
          ...s,
          role_id: s.role_id && validRoles.has(s.role_id) ? s.role_id : null,
          assigned_user_id: s.assigned_user_id && validPeople.has(s.assigned_user_id) ? s.assigned_user_id : null,
        }))
        .sort((a: Suggestion, b: Suggestion) => (a.shift_date + a.start_time).localeCompare(b.shift_date + b.start_time));
      setResult({ summary: data?.summary ?? '', shifts: clean });
      setSelected(new Set(clean.map((_, i) => i)));
    } catch (e) {
      setError(errorMessage(e, 'Could not generate a rota.'));
    } finally {
      setLoading(false);
    }
  };

  const addSelected = async () => {
    if (!result) return;
    const rows = result.shifts.filter((_, i) => selected.has(i)).map(s => ({
      business_id: p.businessId, store_id: storeId, role_id: s.role_id,
      assigned_user_id: s.assigned_user_id, shift_date: s.shift_date,
      start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5),
      break_minutes: s.break_minutes ?? 0, notes: null, is_published: false,
      status: (s.assigned_user_id ? 'scheduled' : 'unassigned') as 'scheduled' | 'unassigned',
      created_by: p.userId,
    }));
    if (!rows.length) return;
    setSaving(true);
    const { error: insErr } = await supabase.from('shifts').insert(rows);
    setSaving(false);
    if (insErr) { toast.error(insErr.message); return; }
    toast.success(`Added ${rows.length} draft shift${rows.length === 1 ? '' : 's'}`);
    p.onAdded(); p.onClose();
  };

  const toggle = (i: number) => setSelected(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  return (
    <Modal open={p.open} onClose={p.onClose} title="Suggest a rota" size="lg">
      {!result ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
            Describe the cover you need for the week of {fmtDate(p.weekStart, 'd MMM yyyy')}. We'll suggest shifts that fit staff availability, approved leave and job roles. Nothing is saved until you add them.
          </p>
          <Field label="Store">
            <Select value={storeId} onChange={e => setStoreId(e.target.value)}>
              {p.stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Staffing needs" error={error}>
            <TextArea rows={6} value={needs} onChange={e => setNeeds(e.target.value)} placeholder={EXAMPLE} />
          </Field>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {result.summary && <p style={{ margin: 0, fontSize: 14 }}>{result.summary}</p>}
          {result.shifts.length === 0 ? <p style={{ color: 'var(--muted)' }}>No shifts were suggested.</p> : (
            <div style={{ maxHeight: 420, overflowY: 'auto', display: 'grid', gap: 6 }}>
              {result.shifts.map((s, i) => (
                <label key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} style={{ marginTop: 3 }} />
                  <div style={{ fontSize: 14, lineHeight: 1.4 }}>
                    <strong>{fmtDate(new Date(s.shift_date + 'T00:00:00'), 'EEE d MMM')}</strong> · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {roleName(s.role_id)}
                    <div>{personName(s.assigned_user_id)}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{s.reason}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>AI suggestions — please check before publishing.</p>
        </div>
      )}
      <div slot="footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {!result ? (
          <>
            <Button variant="ghost" onClick={p.onClose}>Cancel</Button>
            <Button onClick={generate} disabled={loading}>{loading ? 'Planning… (up to a minute)' : 'Suggest rota'}</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setResult(null)}>Back</Button>
            <Button onClick={addSelected} disabled={saving || selected.size === 0}>
              {saving ? 'Adding…' : `Add ${selected.size} as drafts`}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
