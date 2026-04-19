import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { Card } from '@/components/common/Card';
import { Avatar } from '@/components/common/Avatar';
import { Badge } from '@/components/common/Badge';
import { toast } from 'sonner';
import s from './Leave.module.scss';

export default function Team() {
  const { business, role } = useAuth();
  const isMgr = role === 'owner' || role === 'manager';
  const [members, setMembers] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!business) return;
    (async () => {
      const [{ data: roles }, { data: profs }, { data: ep }, { data: stores }, { data: rc }] = await Promise.all([
        supabase.from('user_roles').select('user_id, role').eq('business_id', business.id),
        supabase.from('profiles').select('id, full_name'),
        supabase.from('employee_profiles').select('user_id, employment_type, contracted_hours, primary_store_id, primary_role_id, annual_leave_entitlement').eq('business_id', business.id),
        supabase.from('store_locations').select('id, name').eq('business_id', business.id),
        supabase.from('roles_catalog').select('id, name').eq('business_id', business.id),
      ]);
      const profMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
      const epMap = Object.fromEntries((ep ?? []).map((e: any) => [e.user_id, e]));
      const storeMap = Object.fromEntries((stores ?? []).map((s: any) => [s.id, s.name]));
      const roleMap = Object.fromEntries((rc ?? []).map((r: any) => [r.id, r.name]));
      const merged = (roles ?? []).map((r: any) => ({
        user_id: r.user_id, role: r.role,
        full_name: profMap[r.user_id] ?? 'Member',
        employment_type: epMap[r.user_id]?.employment_type ?? '—',
        contracted_hours: epMap[r.user_id]?.contracted_hours,
        primary_store: storeMap[epMap[r.user_id]?.primary_store_id] ?? '—',
        primary_role: roleMap[epMap[r.user_id]?.primary_role_id] ?? '—',
        annual_leave_entitlement: epMap[r.user_id]?.annual_leave_entitlement ?? 28,
      }));
      setMembers(merged);
    })();
  }, [business]);

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
    setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, annual_leave_entitlement: value } : m));
    setEditingId(null);
    toast.success('Entitlement updated');
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div><span className={s.eye}>Team</span><h1 className={s.h1}>Your people</h1></div>
      </header>
      <Card padded={false}>
        <table className={s.table}>
          <thead><tr><th>Name</th><th>Role</th><th>Job</th><th>Primary store</th><th>Employment</th><th>Hours</th><th>Annual leave</th></tr></thead>
          <tbody>
            {members.map(m => (
              <tr key={m.user_id}>
                <td><div className={s.who}><Avatar name={m.full_name} size="sm" /><span>{m.full_name}</span></div></td>
                <td><Badge tone={m.role === 'owner' ? 'brand' : m.role === 'manager' ? 'info' : 'neutral'} dot>{m.role}</Badge></td>
                <td>{m.primary_role}</td>
                <td>{m.primary_store}</td>
                <td style={{textTransform:'capitalize'}}>{String(m.employment_type).replace('_',' ')}</td>
                <td>{m.contracted_hours ? `${m.contracted_hours}h/wk` : '—'}</td>
                <td>
                  {isMgr && editingId === m.user_id ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="number"
                        min={0}
                        max={365}
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveEntitlement(m.user_id); if (e.key === 'Escape') setEditingId(null); }}
                        style={{ width: 64, padding: '4px 8px', borderRadius: 6, border: '1px solid hsl(var(--border, 220 13% 91%))', font: 'inherit' }}
                      />
                      <button onClick={() => saveEntitlement(m.user_id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'inherit' }}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}>Cancel</button>
                    </span>
                  ) : (
                    <span
                      style={{ cursor: isMgr ? 'pointer' : 'default' }}
                      onClick={() => { if (!isMgr) return; setDraft(String(m.annual_leave_entitlement)); setEditingId(m.user_id); }}
                      title={isMgr ? 'Click to edit' : undefined}
                    >
                      {m.annual_leave_entitlement} days
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
