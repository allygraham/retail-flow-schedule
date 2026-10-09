import { InitialPageLoader } from '@/components/common/InitialPageLoader';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { AccountLoadError } from './AccountLoadError';
import { useAuth } from './authContext';
import type { AppRole } from '@/types/domain';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/common/Button';
import type { AppPermission } from './permissions';
import s from './ProtectedRoute.module.scss';

interface Props {
  fullPage?: boolean;
  children: ReactNode;
  roles?: AppRole[];
  permission?: AppPermission;
  redirectTo?: string;
  fallback?: 'redirect' | 'denied';
}

export function ProtectedRoute({ children, fullPage = false, roles, permission, redirectTo = '/dashboard', fallback = 'redirect' }: Props) {
  const { loading, error, user, business, role, hasPermission } = useAuth();

  if (loading) {
    return (
      fullPage ? <InitialPageLoader /> : <LoadingSkeleton label="Loading account" />
    );
  }
  if (error) return <div className={s.denied}><AccountLoadError /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!business) return <Navigate to="/signup" replace />;
  const hasAllowedRole = !roles || (role ? roles.includes(role) : false);
  const hasAllowedPermission = !permission || hasPermission(permission);
  if (!hasAllowedRole || !hasAllowedPermission) {
    if (fallback === 'denied') {
      return (
        <div className={s.denied}>
          <EmptyState
            title="Access denied"
            description="You don’t have permission to view this area."
            action={<Button onClick={() => window.history.back()}>Go back</Button>}
          />
        </div>
      );
    }
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
}
