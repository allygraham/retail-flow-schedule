import * as Dialog from '@radix-ui/react-dialog';
import { errorMessage } from '@/lib/errors';
import { SignOutError } from '@/features/auth/signOut';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { PageBoundary } from "@/components/common/PageBoundary";
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, LogOut, LayoutDashboard, Calendar, CalendarDays, Users, MapPin, User, Settings,
} from 'lucide-react';
import { useAuth } from '@/features/auth/authContext';
import { Logo } from '@/components/common/Logo';
import { Avatar } from '@/components/common/Avatar';
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

const NAV_GROUPS: Array<{ label: string; keys: AppNavItem[] }> = [
  { label: 'Work', keys: ['dashboard', 'rota', 'leave'] },
  { label: 'Manage', keys: ['team', 'stores'] },
  { label: 'Account', keys: ['profile', 'settings'] },
];

export default function AppShell({ children }: { children?: ReactNode }) {
  const { fullName, business, role, user, signOut, hasPermission, loading } = useAuth();
  const { theme } = useBranding();
  const workspaceName = theme.displayName || business?.name || 'Workspace';
  const nav = useNavigate();
  const location = useLocation();
  const canManageLeave = hasPermission('manage_leave');
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingLeave, setPendingLeave] = useState(0);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const navigatingRef = useRef(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Include query/hash navigation, and release the mobile focus trap on resize.
  useEffect(() => { setMenuOpen(false); }, [location.key]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  const navigateFromMenu = () => {
    navigatingRef.current = true;
    setMenuOpen(false);
  };

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
    if (loading) return ['dashboard', 'rota', 'leave', 'profile'].includes(item.key);
    const permission = NAV_PERMISSIONS[item.key];
    return permission ? hasPermission(permission) : true;
  });

  const renderNav = (onClick?: () => void) => (
    <nav className={s.nav} aria-label="Primary navigation">
      {NAV_GROUPS.map(group => {
        const links = items.filter(item => group.keys.includes(item.key));
        if (!links.length) return null;
        return <div key={group.label} className={s.navGroup} role="group" aria-label={group.label}>
          <p className={s.groupLabel} aria-hidden="true">{group.label}</p>
          {links.map(n => {
        const Icon = n.icon;
        return (
          <NavLink
            key={n.to}
            to={n.to}
            onClick={onClick}
            className={({isActive}) => `${s.link} ${isActive ? s.active : ''}`}
          >
            <div className={s.linkInner}>
              <Icon size={ICON_SIZE} className={s.linkIcon} aria-hidden="true" />
              <span>{n.label}</span>
            </div>
            {n.to === '/leave' && canManageLeave && pendingLeave > 0 && (
              <span className={s.linkBadge} aria-label={`${pendingLeave} pending`}>{pendingLeave}</span>
            )}
          </NavLink>
        );
          })}
        </div>;
      })}
    </nav>
  );

  const renderUser = () => (
    <div className={s.accountFooter}>
      <div className={s.user}>
        <Avatar name={fullName} />
        <span className={s.userInfo}><span className={s.userName}>{fullName ?? 'You'}</span><span className={s.userRole}>{role ?? 'Member'}</span></span>
      </div>
    <button type="button" aria-label="Sign out" className={s.signoutButton} onClick={async () => {
      try { await signOut(); nav('/login', { replace: true }); } catch (error) {
        const message = errorMessage(error, 'Could not sign out. Please try again.');
        if (error instanceof SignOutError && error.localSignedOut) {
          nav('/login', { replace: true });
        } else { toast.error(message); }
      }
    }}>
      <LogOut size={18} aria-hidden="true" />
      <span>Sign out</span>
    </button>
    </div>
  );

  const renderWorkspace = (onClick?: () => void) => (
    <Link className={s.workspaceIdentity} to="/dashboard" onClick={onClick} aria-label={workspaceName}>
      {theme.logoUrl ? <img className={s.workspaceLogo} src={theme.logoUrl} alt="" /> : <Avatar name={workspaceName} />}
      <span className={s.workspaceCopy}><span className={s.workspaceName}>{workspaceName}</span><span className={s.workspaceRole}>{role ?? 'Member'} workspace</span></span>
    </Link>
  );

  return (
    <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
    <Sonner />
    <div className={`${s.shell} tenantTheme`} style={buildThemeStyle(theme)}>
      <a className={s.skipLink} href="#main-content" onClick={() => mainRef.current?.focus()}>Skip to content</a>
      {/* Mobile top bar */}
      <header className={s.topbar}>
        <Dialog.Trigger asChild><button
          ref={hamburgerRef}
          type="button"
          className={s.hamburger}
          aria-label="Open menu"
        >
          <Menu size={22} aria-hidden="true" />
        </button></Dialog.Trigger>
        <div className={s.topbarBrand}><Logo to="/dashboard" size="sm" useBusinessLogo /></div>
        <NotificationsBell variant="mobile" />
      </header>

      {/* Shared desktop and mobile navigation structure. */}
      <aside className={s.side}>
        <div className={s.sideBrand}>
          {renderWorkspace()}
          <NotificationsBell variant="desktop" />
        </div>
        {renderNav()}
        {renderUser()}
      </aside>

      {/* Radix handles focus trapping, background accessibility and scroll locking. */}
      <Dialog.Portal>
        <Dialog.Overlay className={`${s.backdrop} ${s.backdropOpen}`} />
        <Dialog.Content asChild aria-describedby={undefined}
          onOpenAutoFocus={event => { event.preventDefault(); navigatingRef.current = false; closeBtnRef.current?.focus(); }}
          onCloseAutoFocus={event => {
            if (navigatingRef.current || window.matchMedia('(min-width: 768px)').matches) {
              event.preventDefault();
              mainRef.current?.focus();
            }
            navigatingRef.current = false;
          }}>
          <aside className={`${s.drawer} ${s.drawerOpen} tenantTheme`} style={buildThemeStyle(theme)}>
            <Dialog.Title className={s.srOnly}>Main navigation</Dialog.Title>
            <div className={s.drawerHead}>
              {renderWorkspace(navigateFromMenu)}
              <Dialog.Close asChild>
                <button ref={closeBtnRef} type="button" className={s.closeBtn} aria-label="Close menu">
                  <X size={22} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
                {renderNav(navigateFromMenu)}
            {renderUser()}
          </aside>
        </Dialog.Content>
      </Dialog.Portal>

      <main id="main-content" ref={mainRef} tabIndex={-1} className={s.main}><PageBoundary>{children ?? <Outlet />}</PageBoundary></main>
    </div>
    </Dialog.Root>
  );
}
