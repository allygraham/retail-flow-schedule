import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { Stat } from '@/components/common/Stat';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Avatar } from '@/components/common/Avatar';
import { EmptyState } from '@/components/common/EmptyState';
import { fmtDate, fmtTime, isoDate } from '@/lib/datetime';
import s from './Dashboard.module.scss';

export default function Dashboard() {
  const { business, role, user, fullName } = useAuth();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!business) return;
    (async () => {
      const today = isoDate(new Date());
      const [shiftsToday, leaveApproved, sickToday, pendingLeave, unassigned, profiles, myUpcomingRes] = await Promise.all([
        supabase.from('shifts').select('*').eq('business_id', business.id).eq('shift_date', today).eq('is_published', true).neq('status', 'cancelled').order('start_time'),
        supabase.from('leave_requests').select('*').eq('business_id', business.id).eq('status', 'approved').eq('leave_type', 'annual').lte('start_date', today).gte('end_date', today),
        supabase.from('leave_requests').select('*').eq('business_id', business.id).eq('status', 'approved').eq('leave_type', 'sick').lte('start_date', today).gte('end_date', today),
        supabase.from('leave_requests').select('*, profiles!leave_requests_user_id_fkey(full_name)').eq('business_id', business.id).eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('shifts').select('*, store_locations(name), roles_catalog(name)').eq('business_id', business.id).eq('status', 'unassigned').gte('shift_date', today).order('shift_date'),
        supabase.from('profiles').select('id, full_name'),
        user?.id
          ? supabase.from('shifts').select('*, store_locations(name)').eq('business_id', business.id).eq('assigned_user_id', user.id).eq('is_published', true).neq('status', 'cancelled').gte('shift_date', today).order('shift_date').order('start_time').limit(5)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      setData({
        shiftsToday: shiftsToday.data ?? [],
        leaveApproved: leaveApproved.data ?? [],
        sickToday: sickToday.data ?? [],
        pendingLeave: pendingLeave.data ?? [],
        unassigned: unassigned.data ?? [],
        profilesById: Object.fromEntries((profiles.data ?? []).map((p: any) => [p.id, p.full_name])),
        myUpcoming: myUpcomingRes.data ?? [],
      });
    })();
  }, [business]);

  if (!business) return null;
  if (!data) return <div className={s.loading}>Loading…</div>;

  const isMgr = role === 'owner' || role === 'manager';
  const myUpcoming = data.myUpcoming ?? [];
  const greeting = `${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}, ${fullName?.split(' ')[0] ?? 'there'}`;

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <span className={s.eye}>{isMgr ? 'Manager dashboard' : 'My dashboard'}</span>
          <h1 className={s.h1}>{greeting}</h1>
          <p className={s.sub}>{fmtDate(new Date(), 'EEEE, d MMMM yyyy')} · {business.name}</p>
        </div>
      </header>

      <div className={s.stats}>
        <Stat label="Working today" value={data.shiftsToday.filter((s:any)=>s.assigned_user_id).length} accent="success" hint="Across all stores" />
        <Stat label="On annual leave" value={data.leaveApproved.length} accent="brand" />
        <Stat label="Off sick" value={data.sickToday.length} accent="danger" />
        <Stat label="Unassigned shifts" value={data.unassigned.length} accent="warn" hint="Need cover" />
        {isMgr && <Stat label="Pending requests" value={data.pendingLeave.length} accent="warn" />}
      </div>

      <div className={s.cols}>
        <Card title="Today's shifts" subtitle={`${data.shiftsToday.length} scheduled`}>
          {data.shiftsToday.length === 0 ? (
            <EmptyState title="No shifts today" description="Enjoy the quiet day!" />
          ) : (
            <ul className={s.list}>
              {data.shiftsToday.map((sh: any) => (
                <li key={sh.id} className={s.row}>
                  <Avatar name={sh.assigned_user_id ? data.profilesById[sh.assigned_user_id] : 'Unassigned'} />
                  <div className={s.rowMain}>
                    <div className={s.rowName}>{sh.assigned_user_id ? data.profilesById[sh.assigned_user_id] : 'Unassigned'}</div>
                    <div className={s.rowMeta}>{fmtTime(sh.start_time)} – {fmtTime(sh.end_time)}</div>
                  </div>
                  <Badge tone="working" dot>Working</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {!isMgr ? (
          <Card title="Your next shifts">
            {myUpcoming.length === 0 ? (
              <EmptyState title="No shift today" description="Check the rota for upcoming dates." />
            ) : (
              <ul className={s.list}>
                {myUpcoming.map((sh: any) => (
                  <li key={sh.id} className={s.row}>
                    <div className={s.rowMain}>
                      <div className={s.rowName}>Today</div>
                      <div className={s.rowMeta}>{fmtTime(sh.start_time)} – {fmtTime(sh.end_time)}{sh.notes ? ` · ${sh.notes}` : ''}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Card title="Pending leave requests" subtitle="Awaiting your review">
            {data.pendingLeave.length === 0 ? (
              <EmptyState title="All caught up" description="No requests need attention." />
            ) : (
              <ul className={s.list}>
                {data.pendingLeave.slice(0, 6).map((lr: any) => (
                  <li key={lr.id} className={s.row}>
                    <Avatar name={lr.profiles?.full_name} />
                    <div className={s.rowMain}>
                      <div className={s.rowName}>{lr.profiles?.full_name ?? 'Employee'}</div>
                      <div className={s.rowMeta}>{fmtDate(lr.start_date)} → {fmtDate(lr.end_date)} · {lr.leave_type}</div>
                    </div>
                    <Badge tone="pending" dot>Pending</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card title="Coverage gaps" subtitle="Upcoming unassigned shifts">
          {data.unassigned.length === 0 ? (
            <EmptyState title="Fully covered" description="No gaps in the published rota." />
          ) : (
            <ul className={s.list}>
              {data.unassigned.slice(0, 6).map((sh: any) => (
                <li key={sh.id} className={s.row}>
                  <div className={s.rowMain}>
                    <div className={s.rowName}>{sh.store_locations?.name} · {sh.roles_catalog?.name ?? 'Floor'}</div>
                    <div className={s.rowMeta}>{fmtDate(sh.shift_date)} · {fmtTime(sh.start_time)}–{fmtTime(sh.end_time)}</div>
                  </div>
                  <Badge tone="unassigned" dot>Open</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
