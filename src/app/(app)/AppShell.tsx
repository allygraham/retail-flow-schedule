import { PageBoundary } from "@/components/common/PageBoundary";
import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, LayoutDashboard, Calendar, CalendarDays, Users, MapPin, User, Settings,
} from 'lucide-react';
import { useAuth } from '@/features/auth/authContext';
import { Logo } from '@/components/common/Logo';
import { Avatar } from '@/components/common/Avatar';
import { Badge } from '@/components/common/Badge';
import { NotificationsBell } from '@/features/notifications/NotificationsBell';
import { useBranding, buildThemeStyle } from '@/features/branding/brandingContext';
import { NAV_PERMISSIONS, type AppNavItem } from '@/features/auth/permissions';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import s from './AppShell.module.scss';

const ICON_SIZE = 18;

const NAV: Array<{ key: AppNavItem; to: string; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'rota', to: '/rota', label: 'Rota', icon: Calendar },
  { key: 'leave', to: '/leave', label: 'Leave & absence', icon: CalendarDays },
  { key: 'team', to: '/team', label: 'Team', icon: Users },
  { key: 'stores', to: '/stores', label: 'Stores', icon: MapPin },
  { key: 'profile', to: '/profile', label: 'My profile', icon: User },
  { key: 'settings', to: '/settings', label: 'Settings', icon: Settings },
];

export default function AppShell({ children }: { children?: ReactNode }) {
  const { fullName, business, role, user, signOut, hasPermission } = useAuth();
  const { theme } = useBranding();
  const workspaceName = theme.displayName || business?.name || 'Workspace';
  const nav = useNavigate();
  const location = useLocation();
  const canManageLeave = hasPermission('manage_leave');
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
      const hamburger = hamburgerRef.current;
      document.body.style.overflow = 'hidden';
      closeBtnRef.current?.focus();
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
      window.addEventListener('keydown', onKey);
      return () => {
        document.body.style.overflow = prev;
        window.removeEventListener('keydown', onKey);
        hamburger?.focus();
      };
    }
  }, [menuOpen]);

  // Manager-only pending leave badge. Live via realtime + initial fetch.
  useEffect(() => {
    if (!business || !canManageLeave) { setPendingLeave(0); return; }
    let cancelled = false;
    const fetchCount = () => {
      supabase
        .from('leave_requests')
        .select('id, user_id')
        .eq('business_id', business.id)
        .eq('status', 'pending')
        .then(({ data }) => {
          if (cancelled) return;
          const reviewable = (data ?? []).filter((request) => role !== 'manager' || request.user_id !== user?.id);
          setPendingLeave(reviewable.length);
        });
    };
    fetchCount();
    const channel = supabase
      .channel(`leave_badge:${business.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_requests', filter: `business_id=eq.${business.id}` },
        (payload) => {
          fetchCount();
          if (payload.eventType === 'INSERT' && payload.new?.status === 'pending') {
            const newRow = payload.new;
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
  }, [business, canManageLeave, nav, role, user?.id]);

  const items = NAV.filter((item) => {
    const permission = NAV_PERMISSIONS[item.key];
    return permission ? hasPermission(permission) : true;
  });

  const renderNav = (onClick?: () => void) => (
    <nav className={s.nav}>
      {items.map(n => {
        const Icon = n.icon;
        return (
          <NavLink
            key={n.to}
            to={n.to}
            onClick={onClick}
            className={({isActive}) => `${s.link} ${isActive ? s.active : ''}`}
          >
            <div className={s.linkInner}>
              <Icon size={ICON_SIZE} className={s.linkIcon} />
              <span>{n.label}</span>
            </div>
            {n.to === '/leave' && canManageLeave && pendingLeave > 0 && (
              <span className={s.linkBadge} aria-label={`${pendingLeave} pending`}>{pendingLeave}</span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );

  const renderUser = () => (
    <div className={s.user}>
      <Avatar name={fullName} />
      <div className={s.userInfo}>
        <div className={s.userName}>{fullName ?? 'You'}</div>
        <button onClick={async () => { try { await signOut(); nav('/login', { replace: true }); } catch { toast.error('Could not sign out. Please try again.'); } }} className={s.signout}>Sign out</button>
      </div>
    </div>
  );

  const renderBiz = () => (
    <div className={s.biz}>
      <div className={s.bizName}>{workspaceName}</div>
      <Badge tone="brand" dot className={s.roleBadge}>{role ?? '—'}</Badge>
    </div>
  );

  return (
    <div className={`${s.shell} tenantTheme`} style={buildThemeStyle(theme)}>
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

      <main className={s.main}>{children ?? <PageBoundary><Outlet /></PageBoundary>}</main>
    </div>
  );
}
