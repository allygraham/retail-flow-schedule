import { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { Logo } from '@/components/common/Logo';
import { Avatar } from '@/components/common/Avatar';
import { Badge } from '@/components/common/Badge';
import s from './AppShell.module.scss';

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/rota', label: 'Rota' },
  { to: '/leave', label: 'Leave' },
  { to: '/team', label: 'Team', mgr: true },
  { to: '/stores', label: 'Stores', mgr: true },
  { to: '/profile', label: 'My profile' },
  { to: '/settings', label: 'Settings', mgr: true },
];

export default function AppShell({ children }: { children?: ReactNode }) {
  const { fullName, business, role, signOut } = useAuth();
  const nav = useNavigate();
  const isMgr = role === 'owner' || role === 'manager';

  return (
    <div className={s.shell}>
      <aside className={s.side}>
        <div className={s.brand}><Logo size="sm" /></div>
        <div className={s.biz}>
          <div className={s.bizName}>{business?.name ?? 'Workspace'}</div>
          <Badge tone="brand" dot>{role ?? '—'}</Badge>
        </div>
        <nav className={s.nav}>
          {NAV.filter(n => !n.mgr || isMgr).map(n => (
            <NavLink key={n.to} to={n.to} className={({isActive}) => `${s.link} ${isActive ? s.active : ''}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className={s.user}>
          <Avatar name={fullName} />
          <div className={s.userInfo}>
            <div className={s.userName}>{fullName ?? 'You'}</div>
            <button onClick={async () => { await signOut(); nav('/'); }} className={s.signout}>Sign out</button>
          </div>
        </div>
      </aside>
      <main className={s.main}>{children ?? <Outlet />}</main>
    </div>
  );
}
