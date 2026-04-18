import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import type { AppRole } from '@/types/domain';
import s from './ProtectedRoute.module.scss';

interface Props {
  children: ReactNode;
  roles?: AppRole[]; // if provided, restrict
}

export function ProtectedRoute({ children, roles }: Props) {
  const { loading, user, role } = useAuth();

  if (loading) {
    return (
      <div className={s.loader}>
        <div className={s.spinner} />
        <div className={s.label}>Loading Lavoro…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && role && !roles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
