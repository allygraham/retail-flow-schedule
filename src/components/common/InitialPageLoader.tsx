import { useLocation } from 'react-router-dom';
import { useOptionalAuth } from '@/features/auth/authContext';
import { LoadingSkeleton } from './LoadingSkeleton';
import authStyles from '@/app/(auth)/Auth.module.scss';
import s from './InitialPageLoader.module.scss';

const authPaths = new Set(['/login', '/signup', '/forgot-password', '/reset-password', '/accept-invite']);

// A saved session is a visual hint only. ProtectedRoute still verifies access.
function hasSessionHint() {
  try {
    const project = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0];
    const session = JSON.parse(localStorage.getItem(`sb-${project}-auth-token`) ?? 'null');
    return typeof session?.access_token === 'string' && typeof session?.user?.id === 'string';
  } catch { return false; }
}

export function InitialPageLoader() {
  const { pathname } = useLocation();
  const auth = useOptionalAuth();
  const signedIn = !authPaths.has(pathname) && !!(auth?.user || (auth?.loading && hasSessionHint()));
  const block = (className: string) => <div className={`${s.block} ${className}`} />;
  if (!signedIn) {
    const fields = pathname === '/signup' ? 4 : pathname === '/forgot-password' ? 1 : 2;
    return <div className={authStyles.page} role="status" aria-label="Loading page" aria-busy="true" data-loading-layout="auth">
      <div className={authStyles.card} aria-hidden="true">
        {block(s.brand)}{block(s.title)}{block(s.subtitle)}
        <div className={s.fields}>{Array.from({ length: fields }, (_, i) => <div key={i}>{block(s.label)}{block(s.input)}</div>)}</div>
        {block(s.button)}{block(s.foot)}
      </div>
    </div>;
  }
  return <div className={s.shell} role="status" aria-label="Loading page" aria-busy="true" data-loading-layout="workspace">
    <div className={s.sidebar} aria-hidden="true">
      {block(s.workspace)}
      <div className={s.navigation}>{Array.from({ length: 6 }, (_, i) => <div className={s.navRow} key={i}>{block(s.icon)}{block(s.navLabel)}</div>)}</div>
      <div className={s.account}>{block(s.icon)}{block(s.navLabel)}</div>
    </div>
    <div className={s.topbar} aria-hidden="true">{block(s.icon)}{block(s.brand)}{block(s.icon)}</div>
    <div className={s.main} aria-hidden="true">
      {block(s.eyebrow)}{block(s.heading)}{block(s.subtitle)}
      <div className={s.content}>
        <LoadingSkeleton layout={pathname === '/rota' ? 'rota-content' : pathname === '/dashboard' || pathname === '/' ? 'dashboard-content' : 'list'} />
      </div>
    </div>
  </div>;
}
