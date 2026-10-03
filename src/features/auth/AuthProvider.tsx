import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole, Business } from '@/types/domain';
import { hasPermission, type AppPermission } from './permissions';

interface TenancyState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  fullName: string | null;
  business: Business | null;
  role: AppRole | null;
  hasPermission: (permission: AppPermission) => boolean;
  signOut: () => Promise<void>;
  refresh: (businessId?: string) => Promise<void>;
}

const Ctx = createContext<TenancyState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const can = useCallback((permission: AppPermission) => hasPermission(role, permission), [role]);

  const preferredBusiness = useRef<string | undefined>();
  const tenancyRequest = useRef(0);
  const loadTenancy = useCallback(async (uid: string) => {
    const request = ++tenancyRequest.current;
    const [{ data: profile }, { data: membership }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', uid).maybeSingle(),
      (() => {
        let query = supabase.from('memberships').select('business_id, businesses(*)').eq('user_id', uid).eq('is_active', true);
        if (preferredBusiness.current) query = query.eq('business_id', preferredBusiness.current);
        return query.order('created_at', { ascending: true }).limit(1).maybeSingle();
      })(),
    ]);
    if (request !== tenancyRequest.current) return;
    setFullName(profile?.full_name ?? null);
    const biz = (membership as any)?.businesses as Business | null;
    setBusiness(biz ?? null);
    if (biz) {
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', uid).eq('business_id', biz.id);
      if (request !== tenancyRequest.current) return;
      const roles = (roleRows ?? []).map((r) => r.role as AppRole);
      const best: AppRole | null =
        roles.includes('owner') ? 'owner'
        : roles.includes('manager') ? 'manager'
        : roles.includes('employee') ? 'employee'
        : null;
      setRole(best);
    } else {
      setRole(null);
    }
  }, []);

  const refresh = useCallback(async (businessId?: string) => {
    if (businessId) preferredBusiness.current = businessId;
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession?.user) await loadTenancy(currentSession.user.id);
  }, [loadTenancy]);

  useEffect(() => {
    // Listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // defer tenancy load
        setTimeout(() => { loadTenancy(s.user.id).finally(() => setLoading(false)); }, 0);
      } else {
        tenancyRequest.current++;
        preferredBusiness.current = undefined;
        setBusiness(null); setRole(null); setFullName(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadTenancy(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => { sub.subscription.unsubscribe(); };
  }, [loadTenancy]);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <Ctx.Provider value={{ loading, session, user, fullName, business, role, hasPermission: can, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
