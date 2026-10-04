import type { ShiftRow, ShiftWithNames } from '@/types/rows';
import type { Tables } from '@/integrations/supabase/types';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, MapPin, Plane, ArrowRight, BellRing } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/authContext';
import { useNotifications } from '@/features/notifications/useNotifications';
import { Stat } from '@/components/common/Stat';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Avatar } from '@/components/common/Avatar';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/common/Button';
import { STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from '@/features/leave/leaveStatus';
import { fmtDate, fmtTime, isoDate, weekStartFor, weekDays, hoursBetween } from '@/lib/datetime';
import { formatDistanceToNow } from 'date-fns';
import { useHolidays } from '@/features/holidays/useHolidays';
import s from './Dashboard.module.scss';

export default function Dashboard() {
  const { business, user, fullName, hasPermission } = useAuth();
  const isMgr = hasPermission('view_operational_dashboards');

  if (!business) return null;
  return isMgr
    ? <ManagerDashboard />
    : <EmployeeDashboard userId={user!.id} fullName={fullName} businessName={business.name} businessId={business.id} />;
}

/* ============================================================
   EMPLOYEE DASHBOARD — focused on "what do I need to know now?"
   ============================================================ */

function EmployeeDashboard({ userId, fullName, businessName, businessId }: {
  userId: string; fullName?: string | null; businessName: string; businessId: string;
}) {
  const nav = useNavigate();
  const { items: notifications } = useNotifications(userId);
  const holidays = useHolidays();
  const [data, setData] = useState<{ upcoming: ShiftWithNames[]; weekShifts: ShiftWithNames[]; leaves: Tables<'leave_requests'>[] } | null>(null);
  const [hiddenNotificationIds, setHiddenNotificationIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const today = isoDate(new Date());
      const weekStart = isoDate(weekStartFor(new Date()));
      const weekEnd = isoDate(weekDays(weekStartFor(new Date()))[6]);

      const [upcoming, weekShifts, leaveRows] = await Promise.all([
        supabase
          .from('shifts')
          .select('*, store_locations(name), roles_catalog(name)')
          .eq('business_id', businessId)
          .eq('assigned_user_id', userId)
          .eq('is_published', true)
          .neq('status', 'cancelled')
          .gte('shift_date', today)
          .order('shift_date').order('start_time')
          .limit(8),
        supabase
          .from('shifts')
          .select('*, store_locations(name), roles_catalog(name)')
          .eq('business_id', businessId)
          .eq('assigned_user_id', userId)
          .eq('is_published', true)
          .neq('status', 'cancelled')
          .gte('shift_date', weekStart)
          .lte('shift_date', weekEnd)
          .order('shift_date').order('start_time'),
        supabase
          .rpc('get_leave_requests', { _business_id: businessId })
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      setData({
        upcoming: upcoming.data ?? [],
        weekShifts: weekShifts.data ?? [],
        leaves: leaveRows.data ?? [],
      });
    })();
  }, [userId, businessId]);

  if (!data) return <div className={s.loading}>Loading…</div>;

  const greeting = `${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}, ${fullName?.split(' ')[0] ?? 'there'}`;
  const next = data.upcoming[0];
  const restUpcoming = data.upcoming.slice(1, 4);
  const today = isoDate(new Date());

  // This week scaffold
  const wkStart = weekStartFor(new Date());
  const days = weekDays(wkStart);
  const shiftsByDate: Record<string, ShiftWithNames[]> = {};
  for (const sh of data.weekShifts) {
    (shiftsByDate[sh.shift_date] ??= []).push(sh);
  }
  // Approved leave covering this week (single self), so we can mark "Off" days
  const approvedLeaveDates = new Set<string>();
  for (const lr of data.leaves) {
    if (lr.status !== 'approved') continue;
    for (const d of days) {
      const iso = isoDate(d);
      if (iso >= lr.start_date && iso <= lr.end_date) approvedLeaveDates.add(iso);
    }
  }

  // Time off buckets
  const todayISO = today;
  const nextApproved = (data.leaves)
    .filter(l => l.status === 'approved' && l.end_date >= todayISO)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  const pendingLeave = (data.leaves).filter(l => l.status === 'pending');
  const recentDecisions = (data.leaves)
    .filter(l => l.status === 'rejected' || l.status === 'approved')
    .slice(0, 3);

  const recentNotifs = notifications.filter(n => !hiddenNotificationIds.includes(n.id)).slice(0, 5);

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <span className={s.eye}>My dashboard</span>
          <h1 className={s.h1}>{greeting}</h1>
          <p className={`${s.sub} text-justify`}>{fmtDate(new Date(), 'EEEE, d MMMM yyyy')} · {businessName}</p>
        </div>
        <div className={s.quickActions}>
          <Button variant="primary" leading={<Plane size={16} />} onClick={() => nav('/leave')}>Request time off</Button>
          <Button variant="secondary" leading={<Calendar size={16} />} onClick={() => nav('/rota')}>View full rota</Button>
        </div>
      </header>

      {/* HERO: Next shift */}
      <section className={s.heroWrap}>
        {next ? (
          <article className={s.hero}>
            <div className={s.heroLeft}>
              <span className={s.heroEye}>{next.shift_date === today ? 'Your shift today' : 'Your next shift'}</span>
              <div className={s.heroDate}>
                <span className={s.heroDay}>{fmtDate(next.shift_date, 'EEEE')}</span>
                <span className={s.heroDayNum}>{fmtDate(next.shift_date, 'd MMM')}</span>
              </div>
              <div className={s.heroTime}>
                <Clock size={20} />
                <span>{fmtTime(next.start_time)} – {fmtTime(next.end_time)}</span>
                <span className={s.heroHours}>· {hoursBetween(next.start_time, next.end_time, next.break_minutes ?? 0)}h</span>
              </div>
              <div className={s.heroMeta}>
                <span><MapPin size={14} /> {next.store_locations?.name ?? 'Store'}</span>
                {next.roles_catalog?.name && <span className={s.dot}>·</span>}
                {next.roles_catalog?.name && <span>{next.roles_catalog.name}</span>}
                {holidays.get(next.shift_date) && <span className={s.dot}>·</span>}
                {holidays.get(next.shift_date) && (
                  <Badge tone="warning" dot>{holidays.get(next.shift_date)!.name}</Badge>
                )}
              </div>
              {next.notes && <p className={s.heroNotes}>“{next.notes}”</p>}
            </div>
            <Badge tone={next.shift_date === today ? 'working' : 'brand'} dot>
              {next.shift_date === today ? 'Today' : 'Upcoming'}
            </Badge>
          </article>
        ) : (
          <div className={s.hero}>
            <EmptyState
              title="No upcoming shifts"
              description="When your manager publishes the rota, your next shift will appear here."
              action={<Button variant="secondary" onClick={() => nav('/rota')}>View rota</Button>}
            />
          </div>
        )}
      </section>

      <div className={s.grid}>
        {/* This week */}
        <Card title="This week" subtitle={`${fmtDate(days[0], 'd MMM')} – ${fmtDate(days[6], 'd MMM')}`}>
          <ul className={s.weekList}>
            {days.map(d => {
              const iso = isoDate(d);
              const isToday = iso === today;
              const dayShifts = shiftsByDate[iso] ?? [];
              const onLeave = approvedLeaveDates.has(iso);
              return (
                <li key={iso} className={`${s.weekRow} ${isToday ? s.weekToday : ''}`}>
                  <div className={s.weekDate}>
                    <div className={s.wDay}>{fmtDate(d, 'EEE')}</div>
                    <div className={s.wNum}>{fmtDate(d, 'd')}</div>
                  </div>
                  <div className={s.weekBody}>
                    {dayShifts.length > 0 ? (
                      dayShifts.map(sh => (
                        <div key={sh.id} className={s.weekShift}>
                          <span className={s.weekTime}>{fmtTime(sh.start_time)}–{fmtTime(sh.end_time)}</span>
                          <span className={s.weekStore}>{sh.store_locations?.name}{sh.roles_catalog?.name ? ` · ${sh.roles_catalog.name}` : ''}</span>
                        </div>
                      ))
                    ) : onLeave ? (
                      <span className={s.weekOff}>On leave</span>
                    ) : (
                      <span className={s.weekOff}>Day off</span>
                    )}
                  </div>
                  {dayShifts.length > 0
                    ? <Badge tone="working" dot>Working</Badge>
                    : onLeave
                      ? <Badge tone="leave" dot>Leave</Badge>
                      : <Badge tone="dayoff">Off</Badge>}
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Upcoming time off */}
        <Card title="Time off" subtitle="Your leave at a glance"
          action={<Button variant="ghost" size="sm" trailing={<ArrowRight size={14} />} onClick={() => nav('/leave')}>Manage</Button>}>
          {!nextApproved && pendingLeave.length === 0 && recentDecisions.length === 0 ? (
            <EmptyState
              title="No leave on record"
              description="Plan ahead — request time off when you need it."
              action={<Button variant="primary" size="sm" onClick={() => nav('/leave')}>Request time off</Button>}
            />
          ) : (
            <ul className={s.list}>
              {nextApproved && (
                <li className={s.row}>
                  <div className={s.iconBubble}><Plane size={16} /></div>
                  <div className={s.rowMain}>
                    <div className={s.rowName}>Next time off</div>
                    <div className={s.rowMeta}>{fmtDate(nextApproved.start_date)} → {fmtDate(nextApproved.end_date)} · {TYPE_LABEL[nextApproved.leave_type as keyof typeof TYPE_LABEL]}</div>
                  </div>
                  <Badge tone="success" dot>Approved</Badge>
                </li>
              )}
              {pendingLeave.slice(0, 3).map(l => (
                <li key={l.id} className={s.row}>
                  <div className={s.iconBubble}><Plane size={16} /></div>
                  <div className={s.rowMain}>
                    <div className={s.rowName}>{TYPE_LABEL[l.leave_type as keyof typeof TYPE_LABEL]}</div>
                    <div className={s.rowMeta}>{fmtDate(l.start_date)} → {fmtDate(l.end_date)}</div>
                  </div>
                  <Badge tone={STATUS_TONE[l.status as keyof typeof STATUS_TONE]} dot>{STATUS_LABEL[l.status as keyof typeof STATUS_LABEL]}</Badge>
                </li>
              ))}
              {recentDecisions
                .filter(d => d.id !== nextApproved?.id)
                .slice(0, 2)
                .map(l => (
                  <li key={l.id} className={s.row}>
                    <div className={s.iconBubble}><Plane size={16} /></div>
                    <div className={s.rowMain}>
                      <div className={s.rowName}>{TYPE_LABEL[l.leave_type as keyof typeof TYPE_LABEL]}</div>
                      <div className={s.rowMeta}>{fmtDate(l.start_date)} → {fmtDate(l.end_date)}</div>
                    </div>
                    <Badge tone={STATUS_TONE[l.status as keyof typeof STATUS_TONE]} dot>{STATUS_LABEL[l.status as keyof typeof STATUS_LABEL]}</Badge>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        {/* Activity / alerts */}
        <Card
          title="Recent updates"
          subtitle="Schedule changes & alerts"
          action={(
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHiddenNotificationIds(prev => [...new Set([...prev, ...notifications.slice(0, 5).map(n => n.id)])])}
              disabled={recentNotifs.length === 0}
            >
              Clear updates
            </Button>
          )}
        >
          {recentNotifs.length === 0 ? (
            <EmptyState title="You're all caught up" description="No new updates right now." />
          ) : (
            <ul className={s.list}>
              {recentNotifs.map(n => (
                <li key={n.id} className={`${s.row} ${!n.read_at ? s.rowUnread : ''}`}>
                  <div className={s.iconBubble}><BellRing size={16} /></div>
                  <div className={s.rowMain}>
                    <div className={s.rowName}>{n.title}</div>
                    {n.body && <div className={s.rowMeta}>{n.body}</div>}
                    <div className={s.rowTime}>{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</div>
                  </div>
                  {!n.read_at && <span className={s.unreadDot} aria-label="Unread" />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Upcoming shifts (compact list, after next) */}
        {restUpcoming.length > 0 && (
          <Card title="Then after that" subtitle="Your next shifts"
            action={<Button variant="ghost" size="sm" trailing={<ArrowRight size={14} />} onClick={() => nav('/rota')}>Full rota</Button>}>
            <ul className={s.list}>
              {restUpcoming.map((sh) => {
                const hol = holidays.get(sh.shift_date);
                return (
                  <li key={sh.id} className={s.shiftRow}>
                    <div className={s.date}>
                      <div className={s.dDay}>{fmtDate(sh.shift_date, 'EEE')}</div>
                      <div className={s.dNum}>{fmtDate(sh.shift_date, 'd')}</div>
                    </div>
                    <div className={s.rowMain}>
                      <div className={s.rowName}>
                        {fmtTime(sh.start_time)} – {fmtTime(sh.end_time)}
                        {hol && <Badge tone="warning" dot>{hol.name}</Badge>}
                      </div>
                      <div className={s.rowMeta}>{sh.store_locations?.name}{sh.roles_catalog?.name ? ` · ${sh.roles_catalog.name}` : ''}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   MANAGER DASHBOARD — unchanged behaviour
   ============================================================ */

function ManagerDashboard() {
  const { business, user, fullName, role } = useAuth();
  const holidays = useHolidays();
  const [data, setData] = useState<{ shiftsToday: ShiftRow[]; leaveApproved: Tables<'leave_requests'>[]; sickToday: Tables<'leave_requests'>[]; pendingLeave: Tables<'leave_requests'>[]; unassigned: ShiftWithNames[]; profilesById: Record<string, string | null> } | null>(null);

  const weekHolidays = useMemo(() => {
    if (!holidays.enabled) return [];
    const ws = weekStartFor(new Date());
    const we = weekDays(ws)[6];
    return holidays.inRange(isoDate(ws), isoDate(we));
  }, [holidays]);

  useEffect(() => {
    if (!business) return;
    (async () => {
      const today = isoDate(new Date());
      const [shiftsToday, leaveApproved, sickToday, pendingLeave, unassigned, profiles] = await Promise.all([
        supabase.from('shifts').select('*').eq('business_id', business.id).eq('shift_date', today).eq('is_published', true).neq('status', 'cancelled').order('start_time'),
        supabase.rpc('get_leave_requests', { _business_id: business.id }).eq('status', 'approved').eq('leave_type', 'annual').lte('start_date', today).gte('end_date', today),
        supabase.rpc('get_leave_requests', { _business_id: business.id }).eq('status', 'approved').eq('leave_type', 'sick').lte('start_date', today).gte('end_date', today),
        supabase.rpc('get_leave_requests', { _business_id: business.id }).eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('shifts').select('*, store_locations(name), roles_catalog(name)').eq('business_id', business.id).eq('status', 'unassigned').gte('shift_date', today).order('shift_date'),
        supabase.from('profiles').select('id, full_name'),
      ]);
      const pendingLeaveRows = (pendingLeave.data ?? []).filter((request) => (
        role !== 'manager' || request.user_id !== user?.id
      ));

      setData({
        shiftsToday: shiftsToday.data ?? [],
        leaveApproved: leaveApproved.data ?? [],
        sickToday: sickToday.data ?? [],
        pendingLeave: pendingLeaveRows,
        unassigned: unassigned.data ?? [],
        profilesById: Object.fromEntries((profiles.data ?? []).map((p) => [p.id, p.full_name])),
      });
    })();
  }, [business, role, user?.id]);

  if (!business) return null;
  if (!data) return <div className={s.loading}>Loading…</div>;

  const greeting = `${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}, ${fullName?.split(' ')[0] ?? 'there'}`;

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <span className={s.eye}>Manager dashboard</span>
          <h1 className={s.h1}>{greeting}</h1>
          <p className={s.sub}>{fmtDate(new Date(), 'EEEE, d MMMM yyyy')} · {business.name}</p>
        </div>
      </header>

      {weekHolidays.length > 0 && (
        <div className={s.holidayBanner} role="status">
          <Calendar size={16} />
          <strong>Public holiday this week:</strong>
          <span className={s.holidayList}>
            {weekHolidays.map((h, i) => (
              <span key={h.date}>
                {i > 0 && <span className={s.dot}>·</span>}
                {h.name} <span className={s.holidayDate}>({fmtDate(h.date, 'EEE d MMM')})</span>
              </span>
            ))}
          </span>
        </div>
      )}

      <div className={s.stats}>
        <Stat label="Working today" value={data.shiftsToday.filter((s) => s.assigned_user_id).length} accent="success" hint="Across all stores" />
        <Stat label="On annual leave" value={data.leaveApproved.length} accent="brand" />
        <Stat label="Off sick" value={data.sickToday.length} accent="danger" />
        <Stat label="Unassigned shifts" value={data.unassigned.length} accent="warn" hint="Need cover" />
        <Stat label="Pending requests" value={data.pendingLeave.length} accent="warn" />
      </div>

      <div className={s.cols}>
        <Card title="Today's shifts" subtitle={`${data.shiftsToday.length} scheduled`}>
          {data.shiftsToday.length === 0 ? (
            <EmptyState title="No shifts today" description="Enjoy the quiet day!" />
          ) : (
            <ul className={s.list}>
              {data.shiftsToday.map((sh) => (
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

        <Card title="Pending leave requests" subtitle="Awaiting your review">
          {data.pendingLeave.length === 0 ? (
            <EmptyState title="All caught up" description="No requests need attention." />
          ) : (
            <ul className={s.list}>
              {data.pendingLeave.slice(0, 6).map((lr) => (
                <li key={lr.id} className={s.row}>
                  <Avatar name={data.profilesById[lr.user_id]} />
                  <div className={s.rowMain}>
                    <div className={s.rowName}>{data.profilesById[lr.user_id] ?? 'Employee'}</div>
                    <div className={s.rowMeta}>{fmtDate(lr.start_date)} → {fmtDate(lr.end_date)} · {lr.leave_type}</div>
                  </div>
                  <Badge tone="pending" dot>Pending</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Coverage gaps" subtitle="Upcoming unassigned shifts">
          {data.unassigned.length === 0 ? (
            <EmptyState title="Fully covered" description="No gaps in the published rota." />
          ) : (
            <ul className={s.list}>
              {data.unassigned.slice(0, 6).map((sh) => (
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
