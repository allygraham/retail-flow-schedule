import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { Card } from '@/components/common/Card';
import { Avatar } from '@/components/common/Avatar';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Field, Input, Select, TextArea } from '@/components/common/Field';
import { EmptyState } from '@/components/common/EmptyState';
import { inviteEmployeeSchema } from '@/lib/validation';
import { toast } from 'sonner';
import s from './Leave.module.scss';
import t from './Team.module.scss';

type AccountStatus = 'active' | 'invited' | 'expired' | 'revoked';

interface Row {
  kind: 'member' | 'invite';
  key: string;
  user_id?: string;
  invitation_id?: string;
  full_name: string;
  email: string;
  role: 'owner' | 'manager' | 'employee';
  store_name: string;
  job_name: string;
  contracted_hours: number | null;
  employment_type: string;
  account_status: AccountStatus;
  annual_leave_entitlement: number;
  accept_token?: string | null;
}

const STATUS_TONE: Record<AccountStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  invited: 'warning',
  expired: 'danger',
  revoked: 'neutral',
};
const STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'Active',
  invited: 'Invited',
  expired: 'Expired',
  revoked: 'Revoked',
};

export default function Team() {
  const { business, role } = useAuth();
  const isMgr = role === 'owner' || role === 'manager';

  const [rows, setRows] = useState<Row[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [jobs, setJobs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [q, setQ] = useState('');
  const [fRole, setFRole] = useState<'all' | 'owner' | 'manager' | 'employee'>('all');
  const [fStore, setFStore] = useState('all');
  const [fStatus, setFStatus] = useState<'all' | AccountStatus>('all');

  // entitlement inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);
  const blankForm = {
    first_name: '', last_name: '', email: '',
    role: 'employee' as 'owner' | 'manager' | 'employee',
    primary_store_id: '', primary_role_id: '',
    contracted_hours: '', hire_date: '', phone: '', notes: '',
  };
  const [form, setForm] = useState(blankForm);

  const load = async () => {
    if (!business) return;
    setLoading(true);
    const [
      { data: roles },
      { data: profs },
      { data: ep },
      { data: storeRows },
      { data: jobRows },
      { data: invites },
    ] = await Promise.all([
      supabase.from('user_roles').select('user_id, role').eq('business_id', business.id),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('employee_profiles')
        .select('user_id, employment_type, contracted_hours, primary_store_id, primary_role_id, annual_leave_entitlement')
        .eq('business_id', business.id),
      supabase.from('store_locations').select('id, name').eq('business_id', business.id).order('name'),
      supabase.from('roles_catalog').select('id, name').eq('business_id', business.id).order('name'),
      isMgr
        ? supabase.from('invitations')
            .select('id, email, full_name, role, primary_store_id, primary_role_id, status, expires_at, token, contracted_hours')
            .eq('business_id', business.id)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // Fetch emails for active members (managers/owners only — service-side limitation otherwise)
    let memberEmails: Record<string, string> = {};
    if (isMgr && (roles ?? []).length) {
      const ids = (roles ?? []).map((r: any) => r.user_id);
      // Try via auth admin endpoint won't work from client; we don't have member emails available.
      // Safe fallback: leave blank for active members; managers can still see them via Cloud.
      memberEmails = Object.fromEntries(ids.map((id: string) => [id, '']));
    }

    const profMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
    const epMap = Object.fromEntries((ep ?? []).map((e: any) => [e.user_id, e]));
    const storeMap = Object.fromEntries((storeRows ?? []).map((x: any) => [x.id, x.name]));
    const jobMap = Object.fromEntries((jobRows ?? []).map((x: any) => [x.id, x.name]));

    const memberRows: Row[] = (roles ?? []).map((r: any) => ({
      kind: 'member',
      key: `m:${r.user_id}`,
      user_id: r.user_id,
      full_name: profMap[r.user_id] ?? 'Member',
      email: memberEmails[r.user_id] ?? '',
      role: r.role,
      store_name: storeMap[epMap[r.user_id]?.primary_store_id] ?? '—',
      job_name: jobMap[epMap[r.user_id]?.primary_role_id] ?? '—',
      contracted_hours: epMap[r.user_id]?.contracted_hours ?? null,
      employment_type: epMap[r.user_id]?.employment_type ?? '—',
      account_status: 'active',
      annual_leave_entitlement: epMap[r.user_id]?.annual_leave_entitlement ?? 28,
    }));

    const inviteRows: Row[] = (invites ?? [])
      .filter((i: any) => i.status === 'pending' || i.status === 'expired' || i.status === 'revoked')
      .map((i: any) => ({
        kind: 'invite',
        key: `i:${i.id}`,
        invitation_id: i.id,
        full_name: i.full_name ?? i.email,
        email: i.email,
        role: i.role,
        store_name: storeMap[i.primary_store_id] ?? '—',
        job_name: jobMap[i.primary_role_id] ?? '—',
        contracted_hours: i.contracted_hours ?? null,
        employment_type: '—',
        account_status:
          i.status === 'pending'
            ? (new Date(i.expires_at) < new Date() ? 'expired' : 'invited')
            : (i.status as AccountStatus),
        annual_leave_entitlement: 28,
        accept_token: i.token,
      }));

    setRows([...memberRows, ...inviteRows]);
    setStores(storeRows ?? []);
    setJobs(jobRows ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [business]);

  // Realtime: refresh on invitation changes for this business
  useEffect(() => {
    if (!business || !isMgr) return;
    const ch = supabase
      .channel(`invitations:${business.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'invitations', filter: `business_id=eq.${business.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [business, isMgr]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (fRole !== 'all' && r.role !== fRole) return false;
      if (fStatus !== 'all' && r.account_status !== fStatus) return false;
      if (fStore !== 'all') {
        // Match by store name lookup
        const wanted = stores.find(x => x.id === fStore)?.name;
        if (!wanted || r.store_name !== wanted) return false;
      }
      if (needle) {
        const hay = `${r.full_name} ${r.email} ${r.role} ${r.store_name} ${r.job_name}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, fRole, fStatus, fStore, stores]);

  const counts = useMemo(() => {
    const c = { active: 0, invited: 0, expired: 0, revoked: 0 };
    rows.forEach(r => { c[r.account_status]++; });
    return c;
  }, [rows]);

  const saveEntitlement = async (userId: string) => {
    if (!business) return;
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 0 || value > 365) {
      toast.error('Enter a number between 0 and 365');
      return;
    }
    const { error } = await supabase
      .from('employee_profiles')
      .update({ annual_leave_entitlement: value })
      .eq('user_id', userId)
      .eq('business_id', business.id);
    if (error) { toast.error(error.message); return; }
    setRows(prev => prev.map(m => m.user_id === userId ? { ...m, annual_leave_entitlement: value } : m));
    setEditingId(null);
    toast.success('Entitlement updated');
  };

  const openInvite = () => {
    setForm({ ...blankForm, primary_store_id: stores[0]?.id ?? '' });
    setInviteErr(null);
    setAcceptUrl(null);
    setInviteOpen(true);
  };

  const submitInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!business) return;
    setInviteErr(null);
    const parsed = inviteEmployeeSchema.safeParse({
      ...form,
      contracted_hours: form.contracted_hours === '' ? undefined : form.contracted_hours,
      hire_date: form.hire_date || null,
      phone: form.phone || null,
      notes: form.notes || null,
      primary_role_id: form.primary_role_id || null,
    });
    if (!parsed.success) { setInviteErr(parsed.error.issues[0].message); return; }

    setInviteBusy(true);
    const fullName = `${parsed.data.first_name} ${parsed.data.last_name}`.trim();
    const { data, error } = await supabase.functions.invoke('invite-employee', {
      body: {
        business_id: business.id,
        email: parsed.data.email,
        full_name: fullName,
        role: parsed.data.role,
        primary_store_id: parsed.data.primary_store_id,
        primary_role_id: parsed.data.primary_role_id ?? null,
        contracted_hours: parsed.data.contracted_hours ?? null,
        hire_date: parsed.data.hire_date ?? null,
        phone: parsed.data.phone ?? null,
        notes: parsed.data.notes ?? null,
        redirect_origin: window.location.origin,
      },
    });
    setInviteBusy(false);
    if (error) {
      // edge function returns JSON {error} with non-2xx
      const msg = (data as any)?.error || error.message || 'Something went wrong';
      setInviteErr(msg);
      return;
    }
    if ((data as any)?.error) { setInviteErr((data as any).error); return; }
    setAcceptUrl((data as any).accept_url ?? null);
    toast.success('Invite created');
    load();
  };

  const copyAccept = async (token: string | null | undefined) => {
    if (!token) return;
    const url = `${window.location.origin}/accept-invite?token=${token}`;
    try { await navigator.clipboard.writeText(url); toast.success('Invite link copied'); }
    catch { toast.error('Copy failed'); }
  };

  const revokeInvite = async (id: string) => {
    const { error } = await supabase.from('invitations').update({ status: 'revoked' }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Invite revoked');
    load();
  };

  const resendInvite = async (id: string) => {
    // Extend expiry by 14 days; the link itself stays the same.
    const newExpiry = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
    const { error } = await supabase
      .from('invitations')
      .update({ expires_at: newExpiry, status: 'pending' })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Invite refreshed');
    load();
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <span className={s.eye}>Team</span>
          <h1 className={s.h1}>Your people</h1>
          <p className={s.sub}>
            {counts.active} active · {counts.invited} invited
            {counts.expired > 0 ? ` · ${counts.expired} expired` : ''}
          </p>
        </div>
        {isMgr && <Button onClick={openInvite}>Add employee</Button>}
      </header>

      <div className={t.toolbar}>
        <Input
          placeholder="Search name, email, role…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className={t.search}
        />
        <Select value={fRole} onChange={e => setFRole(e.target.value as any)}>
          <option value="all">All roles</option>
          <option value="owner">Owner</option>
          <option value="manager">Manager</option>
          <option value="employee">Employee</option>
        </Select>
        <Select value={fStore} onChange={e => setFStore(e.target.value)}>
          <option value="all">All stores</option>
          {stores.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
        <Select value={fStatus} onChange={e => setFStatus(e.target.value as any)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
        </Select>
      </div>

      <Card padded={false}>
        {loading ? (
          <div className={s.loading}>Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={rows.length === 0 ? 'No team yet' : 'No matches'}
            description={rows.length === 0
              ? 'Invite your first employee to get started.'
              : 'Try clearing your filters or searching for a different term.'}
          />
        ) : (
          <table className={s.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Job</th>
                <th>Primary store</th>
                <th>Hours</th>
                <th>Status</th>
                <th>Annual leave</th>
                {isMgr && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.key}>
                  <td>
                    <div className={s.who}>
                      <Avatar name={m.full_name} size="sm" />
                      <span>{m.full_name}</span>
                    </div>
                  </td>
                  <td className={t.emailCell}>{m.email || <span className={s.muted}>—</span>}</td>
                  <td>
                    <Badge tone={m.role === 'owner' ? 'brand' : m.role === 'manager' ? 'info' : 'neutral'} dot>
                      {m.role}
                    </Badge>
                  </td>
                  <td>{m.job_name}</td>
                  <td>{m.store_name}</td>
                  <td>{m.contracted_hours ? `${m.contracted_hours}h/wk` : '—'}</td>
                  <td>
                    <Badge tone={STATUS_TONE[m.account_status]} dot>
                      {STATUS_LABEL[m.account_status]}
                    </Badge>
                  </td>
                  <td>
                    {m.kind === 'invite' ? (
                      <span className={s.muted}>—</span>
                    ) : isMgr && editingId === m.user_id ? (
                      <span className={t.inlineEdit}>
                        <input
                          type="number"
                          min={0}
                          max={365}
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEntitlement(m.user_id!);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className={t.inlineInput}
                        />
                        <button className={t.inlineBtn} onClick={() => saveEntitlement(m.user_id!)}>Save</button>
                        <button className={t.inlineBtnGhost} onClick={() => setEditingId(null)}>Cancel</button>
                      </span>
                    ) : (
                      <span
                        className={isMgr ? t.editable : ''}
                        onClick={() => {
                          if (!isMgr || m.kind !== 'member') return;
                          setDraft(String(m.annual_leave_entitlement));
                          setEditingId(m.user_id!);
                        }}
                        title={isMgr ? 'Click to edit' : undefined}
                      >
                        {m.annual_leave_entitlement} days
                      </span>
                    )}
                  </td>
                  {isMgr && (
                    <td>
                      {m.kind === 'invite' && m.account_status !== 'revoked' && (
                        <div className={t.rowActions}>
                          <button className={t.linkBtn} onClick={() => copyAccept(m.accept_token)}>Copy link</button>
                          {m.account_status === 'expired' && (
                            <button className={t.linkBtn} onClick={() => resendInvite(m.invitation_id!)}>
                              Renew
                            </button>
                          )}
                          <button className={t.linkBtnDanger} onClick={() => revokeInvite(m.invitation_id!)}>
                            Revoke
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Invite modal */}
      <Modal
        open={inviteOpen}
        onClose={() => { setInviteOpen(false); setAcceptUrl(null); }}
        title="Add employee"
        size="lg"
        footer={acceptUrl ? (
          <Button onClick={() => { setInviteOpen(false); setAcceptUrl(null); }}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={submitInvite as any} loading={inviteBusy}>Send invite</Button>
          </>
        )}
      >
        {acceptUrl ? (
          <div className={t.successBlock}>
            <div className={t.successTitle}>Invite created 🎉</div>
            <p className={t.successCopy}>
              Share this link with the new employee. They'll set their own password and join your team.
            </p>
            <div className={t.linkBox}>
              <code className={t.linkText}>{acceptUrl}</code>
              <Button size="sm" variant="outline" onClick={() => copyAccept(acceptUrl.split('token=')[1])}>
                Copy link
              </Button>
            </div>
            <p className={s.muted}>The link is valid for 14 days. You can resend it any time from the team list.</p>
          </div>
        ) : (
          <form onSubmit={submitInvite} className={s.form}>
            <div className={s.row2}>
              <Field label="First name">
                <Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} required />
              </Field>
              <Field label="Last name">
                <Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} required />
              </Field>
            </div>
            <Field label="Work email">
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            </Field>
            <div className={s.row2}>
              <Field label="Role">
                <Select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as any })}>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  {role === 'owner' && <option value="owner">Owner</option>}
                </Select>
              </Field>
              <Field label="Primary store">
                <Select
                  value={form.primary_store_id}
                  onChange={e => setForm({ ...form, primary_store_id: e.target.value })}
                  required
                >
                  <option value="">Select…</option>
                  {stores.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              </Field>
            </div>
            <div className={s.row2}>
              <Field label="Job title" hint="Optional">
                <Select value={form.primary_role_id} onChange={e => setForm({ ...form, primary_role_id: e.target.value })}>
                  <option value="">—</option>
                  {jobs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              </Field>
              <Field label="Contracted hours / week" hint="Optional">
                <Input
                  type="number" min={0} max={168} step={0.5}
                  value={form.contracted_hours}
                  onChange={e => setForm({ ...form, contracted_hours: e.target.value })}
                />
              </Field>
            </div>
            <div className={s.row2}>
              <Field label="Start date" hint="Optional">
                <Input type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} />
              </Field>
              <Field label="Phone" hint="Optional">
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </Field>
            </div>
            <Field label="Notes" hint="Visible to managers only">
              <TextArea
                rows={3}
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                maxLength={500}
              />
            </Field>
            {inviteErr && <div className={s.err}>{inviteErr}</div>}
          </form>
        )}
      </Modal>
    </div>
  );
}
