import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { Card } from '@/components/common/Card';
import { Avatar } from '@/components/common/Avatar';
import { Badge } from '@/components/common/Badge';
import s from './Leave.module.scss';

export default function Team() {
  const { business } = useAuth();
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    if (!business) return;
    (async () => {
      const [{ data: roles }, { data: profs }, { data: ep }, { data: stores }, { data: rc }] = await Promise.all([
        supabase.from('user_roles').select('user_id, role').eq('business_id', business.id),
        supabase.from('profiles').select('id, full_name'),
        supabase.from('employee_profiles').select('user_id, employment_type, contracted_hours, primary_store_id, primary_role_id').eq('business_id', business.id),
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
      }));
      setMembers(merged);
    })();
  }, [business]);

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div><span className={s.eye}>Team</span><h1 className={s.h1}>Your people</h1></div>
      </header>
      <Card padded={false}>
        <table className={s.table}>
          <thead><tr><th>Name</th><th>Role</th><th>Job</th><th>Primary store</th><th>Employment</th><th>Hours</th></tr></thead>
          <tbody>
            {members.map(m => (
              <tr key={m.user_id}>
                <td><div className={s.who}><Avatar name={m.full_name} size="sm" /><span>{m.full_name}</span></div></td>
                <td><Badge tone={m.role === 'owner' ? 'brand' : m.role === 'manager' ? 'info' : 'neutral'} dot>{m.role}</Badge></td>
                <td>{m.primary_role}</td>
                <td>{m.primary_store}</td>
                <td style={{textTransform:'capitalize'}}>{String(m.employment_type).replace('_',' ')}</td>
                <td>{m.contracted_hours ? `${m.contracted_hours}h/wk` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
