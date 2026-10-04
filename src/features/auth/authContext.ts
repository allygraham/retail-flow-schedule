import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { AppRole, Business } from '@/types/domain';
import type { AppPermission } from './permissions';

interface TenancyState {
  loading: boolean;
  error: string | null;
  session: Session | null;
  user: User | null;
  fullName: string | null;
  business: Business | null;
  role: AppRole | null;
  hasPermission: (permission: AppPermission) => boolean;
  signOut: () => Promise<void>;
  refresh: (businessId?: string) => Promise<void>;
}

export const Ctx = createContext<TenancyState | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useOptionalAuth() { return useContext(Ctx); }
