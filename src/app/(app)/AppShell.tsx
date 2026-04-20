import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { Logo } from '@/components/common/Logo';
import { Avatar } from '@/components/common/Avatar';
import { Badge } from '@/components/common/Badge';
import { NotificationsBell } from '@/features/notifications/NotificationsBell';
import { useBranding, buildThemeStyle } from '@/features/branding/BrandingProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
  const { theme } = useBranding();
  const workspaceName = theme.displayName || business?.name || 'Workspace';
  const nav = useNavigate();
  const location = useLocation();
  const isMgr = role === 'owner' || role === 'manager';
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingLeave, setPendingLeave] = useState(0);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Close on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Lock body scroll & focus management
  useEffect(() => {
    if (menuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      closeBtnRef.current?.focus();
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
      window.addEventListener('keydown', onKey);
      return () => {
        document.body.style.overflow = prev;
        window.removeEventListener('keydown', onKey);
        hamburgerRef.current?.focus();
      };
    }
  }, [menuOpen]);

  // Manager-only pending leave badge. Live via realtime + initial fetch.
  useEffect(() => {
    if (!business || !isMgr) { setPendingLeave(0); return; }
    let cancelled = false;
    const fetchCount = () => {
      supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .eq('status', 'pending')
        .then(({ count }) => { if (!cancelled) setPendingLeave(count ?? 0); });
    };
    fetchCount();
    const channel = supabase
      .channel(`leave_badge:${business.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_requests', filter: `business_id=eq.${business.id}` },
        (payload) => {
          fetchCount();
          if (payload.eventType === 'INSERT' && (payload.new as any)?.status === 'pending') {
            const newRow: any = payload.new;
            supabase.auth.getUser().then(({ data }) => {
              if (data.user?.id === newRow.user_id) return;
              toast('New leave request', {
                description: `${newRow.leave_type} · ${newRow.start_date} → ${newRow.end_date}`,
                action: { label: 'Review', onClick: () => nav('/leave') },
              });
            });
          }
        },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [business, isMgr, nav]);

  const items = NAV.filter(n => !n.mgr || isMgr);

  const renderNav = (onClick?: () => void) => (
    <nav className={s.nav}>
      {items.map(n => (
        <NavLink
          key={n.to}
          to={n.to}
          onClick={onClick}
          className={({isActive}) => `${s.link} ${isActive ? s.active : ''}`}
        >
          <span>{n.label}</span>
          {n.to === '/leave' && isMgr && pendingLeave > 0 && (
            <span className={s.linkBadge} aria-label={`${pendingLeave} pending`}>{pendingLeave}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const renderUser = () => (
    <div className={s.user}>
      <Avatar name={fullName} />
      <div className={s.userInfo}>
        <div className={s.userName}>{fullName ?? 'You'}</div>
        <button onClick={async () => { await signOut(); nav('/'); }} className={s.signout}>Sign out</button>
      </div>
    </div>
  );

  const renderBiz = () => (
    <div className={s.biz}>
      <div className={s.bizName}>{workspaceName}</div>
      <Badge tone="brand" dot>{role ?? '—'}</Badge>
    </div>
  );

  return (
    <div className={s.shell}>
      {/* Mobile top bar */}
      <header className={s.topbar}>
        <button
          ref={hamburgerRef}
          type="button"
          className={s.hamburger}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-drawer"
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={22} />
        </button>
        <div className={s.topbarBrand}><Logo size="sm" useBusinessLogo /></div>
        <NotificationsBell variant="mobile" />
      </header>

      {/* Desktop sidebar (unchanged behavior) */}
      <aside className={s.side}>
        <div className={s.sideBrand}>
          <Logo size="sm" useBusinessLogo />
          <NotificationsBell variant="desktop" />
        </div>
        {renderBiz()}
        {renderNav()}
        {renderUser()}
      </aside>

      {/* Mobile drawer */}
      <div
        className={`${s.backdrop} ${menuOpen ? s.backdropOpen : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <aside
        id="mobile-drawer"
        className={`${s.drawer} ${menuOpen ? s.drawerOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Main navigation"
      >
        <div className={s.drawerHead}>
          <Logo size="sm" useBusinessLogo />
          <button
            ref={closeBtnRef}
            type="button"
            className={s.closeBtn}
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={22} />
          </button>
        </div>
        {renderBiz()}
        {renderNav(() => setMenuOpen(false))}
        {renderUser()}
      </aside>

      <main className={s.main}>{children ?? <Outlet />}</main>
    </div>
  );
}
