import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { Card } from '@/components/common/Card';
import { Avatar } from '@/components/common/Avatar';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import { fmtDate, fmtTime, isoDate } from '@/lib/datetime';
import { useLeaveBalance } from '@/features/leave/useLeaveBalance';
import { LeaveBalanceCard } from '@/features/leave/LeaveBalanceCard';
import s from './Profile.module.scss';

export default function Profile() {
  const { user, fullName, role, business, refresh } = useAuth();
  const { balance, loading: balanceLoading } = useLeaveBalance();
  const [name, setName] = useState(fullName ?? '');
  const [phone, setPhone] = useState('');
  const [shifts, setShifts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

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
          <div className={s.form}>
            <Field label="Full name"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
            <Field label="Phone"><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" /></Field>
            <Button onClick={save} loading={saving}>Save changes</Button>
          </div>
        </Card>
        <div className={s.col}>
          <LeaveBalanceCard balance={balance} loading={balanceLoading} />
        <Card title="Upcoming shifts" subtitle="Next 10 published">
          {shifts.length === 0 ? (
            <div className={s.empty}>No upcoming shifts.</div>
          ) : (
            <ul className={s.list}>
              {shifts.map((sh: any) => (
                <li key={sh.id} className={s.row}>
                  <div className={s.date}>
                    <div className={s.dDay}>{fmtDate(sh.shift_date, 'EEE')}</div>
                    <div className={s.dNum}>{fmtDate(sh.shift_date, 'd')}</div>
                  </div>
                  <div className={s.rowMain}>
                    <div className={s.rowName}>{fmtTime(sh.start_time)} – {fmtTime(sh.end_time)}</div>
                    <div className={s.rowMeta}>{sh.store_locations?.name} · {sh.roles_catalog?.name ?? 'Floor'}{sh.notes ? ` · ${sh.notes}` : ''}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        </div>
      </div>
    </div>
  );
}
