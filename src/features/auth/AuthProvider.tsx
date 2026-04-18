import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole, Business } from '@/types/domain';

interface TenancyState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  fullName: string | null;
  business: Business | null;
  role: AppRole | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<TenancyState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTenancy = useCallback(async (uid: string) => {
    const [{ data: profile }, { data: membership }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', uid).maybeSingle(),
      supabase.from('memberships').select('business_id, businesses(*)').eq('user_id', uid).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle(),
    ]);
    setFullName(profile?.full_name ?? null);
    const biz = (membership as any)?.businesses as Business | null;
    setBusiness(biz ?? null);
    if (biz) {
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', uid).eq('business_id', biz.id)
        .order('role', { ascending: true })
        .limit(1).maybeSingle();
      setRole((roleRow?.role as AppRole) ?? null);
    } else {
      setRole(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (user) await loadTenancy(user.id);
  }, [user, loadTenancy]);

  useEffect(() => {
    // Listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // defer tenancy load
        setTimeout(() => { loadTenancy(s.user.id).finally(() => setLoading(false)); }, 0);
      } else {
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
    <Ctx.Provider value={{ loading, session, user, fullName, business, role, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
