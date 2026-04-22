import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { Card } from '@/components/common/Card';
import { Avatar } from '@/components/common/Avatar';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Field, Input, Select, TextArea } from '@/components/common/Field';
import { DatePicker, parseISODate, toISODate } from '@/components/common/DatePicker';
import { EmptyState } from '@/components/common/EmptyState';
import { useLeaveRequests } from '@/features/leave/useLeaveRequests';
import { inviteEmployeeSchema } from '@/lib/validation';
import { toast } from 'sonner';
import s from './Leave.module.scss';
import t from './Team.module.scss';

type AccountStatus = 'active' | 'invited' | 'expired' | 'revoked' | 'disabled';

interface Row {
  kind: 'member' | 'invite';
  key: string;
  user_id?: string;
  invitation_id?: string;
  full_name: string;
  email: string;
  role: 'owner' | 'manager' | 'employee';
  store_id?: string | null;
  store_name: string;
  job_id?: string | null;
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
  disabled: 'neutral',
};
const STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'Active',
  invited: 'Invited',
  expired: 'Expired',
  revoked: 'Revoked',
  disabled: 'Disabled',
};

export default function Team() {
  const { business, role, user, hasPermission } = useAuth();
  const { addForEmployee } = useLeaveRequests();
  const canManageStaff = hasPermission('manage_staff');
  const isOwner = hasPermission('manage_settings');

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

  // edit member modal
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    role: 'employee' as 'owner' | 'manager' | 'employee',
    primary_store_id: '',
    primary_role_id: '',
    contracted_hours: '',
  });

  // confirm deactivate
  const [confirmRow, setConfirmRow] = useState<Row | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [leaveRow, setLeaveRow] = useState<Row | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveErr, setLeaveErr] = useState<string | null>(null);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: 'sick' as 'annual' | 'sick' | 'unpaid',
    start_date: '',
    end_date: '',
    reason: '',
    manager_note: '',
  });

  // filters modal
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount =
    (fRole !== 'all' ? 1 : 0) + (fStore !== 'all' ? 1 : 0) + (fStatus !== 'all' ? 1 : 0);
  const clearFilters = () => { setFRole('all'); setFStore('all'); setFStatus('all'); };

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
      { data: members },
    ] = await Promise.all([
      supabase.from('user_roles').select('user_id, role').eq('business_id', business.id),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('employee_profiles')
        .select('user_id, employment_type, contracted_hours, primary_store_id, primary_role_id, annual_leave_entitlement')
        .eq('business_id', business.id),
      supabase.from('store_locations').select('id, name').eq('business_id', business.id).order('name'),
      supabase.from('roles_catalog').select('id, name').eq('business_id', business.id).order('name'),
      canManageStaff
        ? supabase.from('invitations')
            .select('id, email, full_name, role, primary_store_id, primary_role_id, status, expires_at, token, contracted_hours')
            .eq('business_id', business.id)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      supabase.from('memberships').select('user_id, is_active').eq('business_id', business.id),
    ]);

    let memberEmails: Record<string, string> = {};
    if (canManageStaff && (roles ?? []).length) {
      const ids = (roles ?? []).map((r: any) => r.user_id);
      memberEmails = Object.fromEntries(ids.map((id: string) => [id, '']));
    }

    const profMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
    const epMap = Object.fromEntries((ep ?? []).map((e: any) => [e.user_id, e]));
    const storeMap = Object.fromEntries((storeRows ?? []).map((x: any) => [x.id, x.name]));
    const jobMap = Object.fromEntries((jobRows ?? []).map((x: any) => [x.id, x.name]));
    const memberMap = Object.fromEntries((members ?? []).map((m: any) => [m.user_id, m.is_active]));

    const memberRows: Row[] = (roles ?? []).map((r: any) => {
      const isActive = memberMap[r.user_id] !== false;
      return {
        kind: 'member' as const,
        key: `m:${r.user_id}`,
        user_id: r.user_id,
        full_name: profMap[r.user_id] ?? 'Member',
        email: memberEmails[r.user_id] ?? '',
        role: r.role,
        store_id: epMap[r.user_id]?.primary_store_id ?? null,
        store_name: storeMap[epMap[r.user_id]?.primary_store_id] ?? '—',
        job_id: epMap[r.user_id]?.primary_role_id ?? null,
        job_name: jobMap[epMap[r.user_id]?.primary_role_id] ?? '—',
        contracted_hours: epMap[r.user_id]?.contracted_hours ?? null,
        employment_type: epMap[r.user_id]?.employment_type ?? '—',
        account_status: (isActive ? 'active' : 'disabled') as AccountStatus,
        annual_leave_entitlement: epMap[r.user_id]?.annual_leave_entitlement ?? 28,
      };
    });

    const inviteRows: Row[] = (invites ?? [])
      .filter((i: any) => i.status === 'pending' || i.status === 'expired' || i.status === 'revoked')
      .map((i: any) => ({
        kind: 'invite' as const,
        key: `i:${i.id}`,
        invitation_id: i.id,
        full_name: i.full_name ?? i.email,
        email: i.email,
        role: i.role,
        store_id: i.primary_store_id,
        store_name: storeMap[i.primary_store_id] ?? '—',
        job_id: i.primary_role_id,
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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [business, canManageStaff]);

  useEffect(() => {
    if (!business || !canManageStaff) return;
    const ch = supabase
      .channel(`invitations:${business.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'invitations', filter: `business_id=eq.${business.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [business, canManageStaff]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (fRole !== 'all' && r.role !== fRole) return false;
      if (fStatus !== 'all' && r.account_status !== fStatus) return false;
      if (fStore !== 'all') {
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
    const c = { active: 0, invited: 0, expired: 0, revoked: 0, disabled: 0 };
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
    const newExpiry = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
    const { error } = await supabase
      .from('invitations')
      .update({ expires_at: newExpiry, status: 'pending' })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Invite refreshed');
    load();
  };

  // ---- Edit member ----
  const openEdit = (row: Row) => {
    setEditErr(null);
    setEditForm({
      role: row.role,
      primary_store_id: row.store_id ?? '',
      primary_role_id: row.job_id ?? '',
      contracted_hours: row.contracted_hours != null ? String(row.contracted_hours) : '',
    });
    setEditRow(row);
  };

  const submitEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!business || !editRow?.user_id) return;
    setEditErr(null);

    const hours = editForm.contracted_hours === '' ? null : Number(editForm.contracted_hours);
    if (hours != null && (!Number.isFinite(hours) || hours < 0 || hours > 168)) {
      setEditErr('Contracted hours must be between 0 and 168'); return;
    }
    if (!editForm.primary_store_id) { setEditErr('Pick a primary store'); return; }

    setEditBusy(true);

    // Role change: only owners can change roles or assign owner
    const roleChanged = editForm.role !== editRow.role;
    if (roleChanged && !isOwner) {
      setEditBusy(false);
      setEditErr('Only owners can change roles'); return;
    }

    try {
      if (roleChanged) {
        const { error: roleErr } = await supabase
          .from('user_roles')
          .update({ role: editForm.role })
          .eq('business_id', business.id)
          .eq('user_id', editRow.user_id);
        if (roleErr) throw roleErr;
      }

      // Upsert employee_profile fields
      const { data: existing } = await supabase
        .from('employee_profiles')
        .select('id')
        .eq('business_id', business.id)
        .eq('user_id', editRow.user_id)
        .maybeSingle();

      if (existing) {
        const { error: epErr } = await supabase
          .from('employee_profiles')
          .update({
            primary_store_id: editForm.primary_store_id,
            primary_role_id: editForm.primary_role_id || null,
            contracted_hours: hours,
          })
          .eq('id', existing.id);
        if (epErr) throw epErr;
      } else {
        const { error: epErr } = await supabase
          .from('employee_profiles')
          .insert({
            business_id: business.id,
            user_id: editRow.user_id,
            primary_store_id: editForm.primary_store_id,
            primary_role_id: editForm.primary_role_id || null,
            contracted_hours: hours,
          });
        if (epErr) throw epErr;
      }

      toast.success('Employee updated');
      setEditRow(null);
      load();
    } catch (err: any) {
      setEditErr(err.message || 'Update failed');
    } finally {
      setEditBusy(false);
    }
  };

  // ---- Deactivate / reactivate ----
  const setMembershipActive = async (row: Row, active: boolean) => {
    if (!business || !row.user_id) return;
    setConfirmBusy(true);
    const { error } = await supabase
      .from('memberships')
      .update({ is_active: active })
      .eq('business_id', business.id)
      .eq('user_id', row.user_id);
    setConfirmBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(active ? 'Employee reactivated' : 'Employee deactivated');
    setConfirmRow(null);
    load();
  };

  const canEdit = (row: Row) => {
    if (!canManageStaff || row.kind !== 'member') return false;
    if (row.role === 'owner' && !isOwner) return false;
    return true;
  };
  const canDeactivate = (row: Row) => {
    if (!canManageStaff || row.kind !== 'member') return false;
    if (row.user_id === user?.id) return false; // can't disable self
    if (row.role === 'owner' && !isOwner) return false;
    return true;
  };

  const openLeave = (row: Row) => {
    const today = new Date();
    const todayISO = toISODate(today) || '';
    setLeaveErr(null);
    setLeaveForm({
      leave_type: 'sick',
      start_date: todayISO,
      end_date: todayISO,
      reason: '',
      manager_note: '',
    });
    setLeaveRow(row);
  };

  const submitLeave = async () => {
    if (!leaveRow?.user_id) return;
    setLeaveErr(null);
    setLeaveBusy(true);
    try {
      const result = await addForEmployee({
        user_id: leaveRow.user_id,
        leave_type: leaveForm.leave_type,
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        reason: leaveForm.reason || null,
        manager_note: leaveForm.manager_note || null,
        status: 'approved',
      });
      setLeaveRow(null);
      toast.success(
        result.conflictingShiftCount > 0
          ? `Leave saved — ${result.conflictingShiftCount} shift${result.conflictingShiftCount === 1 ? '' : 's'} reopened for cover.`
          : 'Leave saved'
      );
    } catch (err: any) {
      setLeaveErr(err.message || 'Could not save leave');
    } finally {
      setLeaveBusy(false);
    }
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <span className={s.eye}>Team</span>
          <h1 className={s.h1}>Your people</h1>
          <p className={s.sub}>
            {counts.active} active · {counts.invited} invited
            {counts.disabled > 0 ? ` · ${counts.disabled} disabled` : ''}
            {counts.expired > 0 ? ` · ${counts.expired} expired` : ''}
          </p>
        </div>
        {canManageStaff && <Button onClick={openInvite}>Add employee</Button>}
      </header>

      <div className={t.toolbar}>
        <Input
          placeholder="Search name, email, role…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className={t.search}
        />
        <Button variant="outline" onClick={() => setFiltersOpen(true)}>
          Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
        </Button>
        {activeFilterCount > 0 && (
          <button type="button" className={t.linkBtn} onClick={clearFilters}>Clear</button>
        )}
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
                {canManageStaff && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.key} className={m.account_status === 'disabled' ? t.rowDisabled : ''}>
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
                    ) : canManageStaff && editingId === m.user_id ? (
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
                        className={canManageStaff ? t.editable : ''}
                        onClick={() => {
                          if (!canManageStaff || m.kind !== 'member') return;
                          setDraft(String(m.annual_leave_entitlement));
                          setEditingId(m.user_id!);
                        }}
                        title={canManageStaff ? 'Click to edit' : undefined}
                      >
                        {m.annual_leave_entitlement} days
                      </span>
                    )}
                  </td>
                  {canManageStaff && (
                    <td>
                      <div className={t.rowActions}>
                        {m.kind === 'invite' && m.account_status !== 'revoked' && (
                          <>
                            <button className={t.linkBtn} onClick={() => copyAccept(m.accept_token)}>Copy link</button>
                            {m.account_status === 'expired' && (
                              <button className={t.linkBtn} onClick={() => resendInvite(m.invitation_id!)}>
                                Renew
                              </button>
                            )}
                            <button className={t.linkBtnDanger} onClick={() => revokeInvite(m.invitation_id!)}>
                              Revoke
                            </button>
                          </>
                        )}
                        {canEdit(m) && (
                          <button className={t.linkBtn} onClick={() => openEdit(m)}>Edit</button>
                        )}
                        {m.kind === 'member' && canManageStaff && (
                          <button className={t.linkBtn} onClick={() => openLeave(m)}>Add leave</button>
                        )}
                        {canDeactivate(m) && m.account_status === 'active' && (
                          <button className={t.linkBtnDanger} onClick={() => setConfirmRow(m)}>
                            Deactivate
                          </button>
                        )}
                        {canDeactivate(m) && m.account_status === 'disabled' && (
                          <button className={t.linkBtn} onClick={() => setMembershipActive(m, true)}>
                            Reactivate
                          </button>
                        )}
                      </div>
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
                  {isOwner && <option value="owner">Owner</option>}
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
                <DatePicker
                  value={parseISODate(form.hire_date)}
                  onChange={(d) => setForm({ ...form, hire_date: toISODate(d) })}
                  placeholder="Pick start date"
                />
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

      <Modal
        open={!!leaveRow}
        onClose={() => setLeaveRow(null)}
        title={leaveRow ? `Add leave for ${leaveRow.full_name}` : 'Add leave'}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaveRow(null)}>Cancel</Button>
            <Button onClick={submitLeave} loading={leaveBusy}>Save as approved</Button>
          </>
        }
      >
        <div className={s.form}>
          <div className={s.row2}>
            <Field label="Leave type">
              <Select value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value as any })}>
                <option value="sick">Sick leave</option>
                <option value="annual">Annual leave</option>
                <option value="unpaid">Unpaid leave</option>
              </Select>
            </Field>
            <Field label="Status">
              <Input value="Approved / recorded" disabled readOnly />
            </Field>
          </div>
          <Field label="Dates">
            <DatePicker
              mode="range"
              value={{ from: parseISODate(leaveForm.start_date), to: parseISODate(leaveForm.end_date) }}
              onChange={(r) => setLeaveForm({
                ...leaveForm,
                start_date: toISODate(r.from) || leaveForm.start_date,
                end_date: toISODate(r.to) || toISODate(r.from) || leaveForm.end_date,
              })}
              placeholder="Pick a date range"
            />
          </Field>
          <Field label="Reason" hint="Visible in the employee leave history">
            <TextArea rows={3} value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
          </Field>
          <Field label="Manager note" hint="Optional internal context">
            <TextArea rows={3} value={leaveForm.manager_note} onChange={e => setLeaveForm({ ...leaveForm, manager_note: e.target.value })} />
          </Field>
          {leaveErr && <div className={s.err}>{leaveErr}</div>}
        </div>
      </Modal>

      {/* Edit member modal */}
      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        title={editRow ? `Edit ${editRow.full_name}` : 'Edit employee'}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={submitEdit as any} loading={editBusy}>Save changes</Button>
          </>
        }
      >
        <form onSubmit={submitEdit} className={s.form}>
          <div className={s.row2}>
            <Field label="Role" hint={!isOwner ? 'Only owners can change roles' : undefined}>
              <Select
                value={editForm.role}
                disabled={!isOwner}
                onChange={e => setEditForm({ ...editForm, role: e.target.value as any })}
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </Select>
            </Field>
            <Field label="Primary store">
              <Select
                value={editForm.primary_store_id}
                onChange={e => setEditForm({ ...editForm, primary_store_id: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {stores.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className={s.row2}>
            <Field label="Job title" hint="Optional">
              <Select
                value={editForm.primary_role_id}
                onChange={e => setEditForm({ ...editForm, primary_role_id: e.target.value })}
              >
                <option value="">—</option>
                {jobs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
            <Field label="Contracted hours / week" hint="Optional">
              <Input
                type="number" min={0} max={168} step={0.5}
                value={editForm.contracted_hours}
                onChange={e => setEditForm({ ...editForm, contracted_hours: e.target.value })}
              />
            </Field>
          </div>
          {editErr && <div className={s.err}>{editErr}</div>}
        </form>
      </Modal>

      {/* Confirm deactivate */}
      <Modal
        open={!!confirmRow}
        onClose={() => setConfirmRow(null)}
        title="Deactivate employee?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRow(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={confirmBusy}
              onClick={() => confirmRow && setMembershipActive(confirmRow, false)}
            >
              Deactivate
            </Button>
          </>
        }
      >
        <p className={s.muted}>
          {confirmRow?.full_name} will lose access to {business?.name}. Their shifts and history will be preserved
          and you can reactivate them at any time.
        </p>
      </Modal>

      {/* Filters modal */}
      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter team"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={clearFilters}>Clear all</Button>
            <Button onClick={() => setFiltersOpen(false)}>Done</Button>
          </>
        }
      >
        <div className={s.form}>
          <Field label="Role">
            <Select value={fRole} onChange={e => setFRole(e.target.value as any)}>
              <option value="all">All roles</option>
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="employee">Employee</option>
            </Select>
          </Field>
          <Field label="Store">
            <Select value={fStore} onChange={e => setFStore(e.target.value)}>
              <option value="all">All stores</option>
              {stores.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Field>
          <Field label="Account status">
            <Select value={fStatus} onChange={e => setFStatus(e.target.value as any)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="disabled">Disabled</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
