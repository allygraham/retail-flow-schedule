import { signOutChecked, SignOutError } from './signOut';
import { Ctx } from './authContext';
import { useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole, Business } from '@/types/domain';
import { hasPermission, type AppPermission } from './permissions';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signOutNotice, setSignOutNotice] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const can = useCallback((permission: AppPermission) => hasPermission(role, permission), [role]);

  const preferredBusiness = useRef<string | undefined>();
  const tenancyRequest = useRef(0);
  const activeUser = useRef<string | null>(null);
  const currentBusiness = useRef<string | undefined>();
  currentBusiness.current = business?.id;
  const accountReady = useRef(false);
  accountReady.current = !loading && !error;
  const loadTenancy = useCallback(async (uid: string, background = false) => {
    const request = ++tenancyRequest.current;
    if (!background) { setLoading(true); setError(null); setBusiness(null); setRole(null); setFullName(null); }
    try {
      const [profileResult, membershipResult] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', uid).maybeSingle(),
        (() => {
          let query = supabase.from('memberships').select('business_id, businesses(*)').eq('user_id', uid).eq('is_active', true);
          const selected = preferredBusiness.current ?? (background ? currentBusiness.current : undefined);
          if (selected) query = query.eq('business_id', selected);
          return query.order('created_at', { ascending: true }).limit(1).maybeSingle();
        })(),
      ]);
      if (request !== tenancyRequest.current) return;
      if (profileResult.error) throw profileResult.error;
      if (membershipResult.error) throw membershipResult.error;
      const biz = membershipResult.data?.businesses as Business | null;
      if (membershipResult.data && !biz) throw new Error('Workspace unavailable');
      let best: AppRole | null = null;
      if (biz) {
        const { data: roleRows, error: roleError } = await supabase.from('user_roles').select('role').eq('user_id', uid).eq('business_id', biz.id);
        if (request !== tenancyRequest.current) return;
        if (roleError) throw roleError;
        const roles = (roleRows ?? []).map(r => r.role as AppRole);
        best = roles.includes('owner') ? 'owner' : roles.includes('admin') ? 'admin' : roles.includes('manager') ? 'manager' : roles.includes('employee') ? 'employee' : null;
        if (!best) {
          if (background) { setRole(null); setError('Workspace role unavailable. Please reload your account.'); }
          throw new Error('Workspace role unavailable');
        }
      }
      setFullName(profileResult.data?.full_name ?? null); setBusiness(previous => JSON.stringify(previous) === JSON.stringify(biz ?? null) ? previous : biz ?? null); setRole(best);
    } catch {
      if (request === tenancyRequest.current && !background) setError('Could not load your account. Please try again.');
    } finally {
      if (request === tenancyRequest.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async (businessId?: string) => {
    const request = ++tenancyRequest.current;
    if (businessId) preferredBusiness.current = businessId;
    setLoading(true); setError(null);
    try {
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      if (request !== tenancyRequest.current) return;
      if (sessionError) throw sessionError;
      activeUser.current = currentSession?.user.id ?? null;
      setSession(currentSession); setUser(currentSession?.user ?? null);
      if (currentSession?.user) await loadTenancy(currentSession.user.id);
      else { tenancyRequest.current++; setBusiness(null); setRole(null); setFullName(null); setLoading(false); }
    } catch { if (request === tenancyRequest.current) { setError('Could not load your account. Please try again.'); setLoading(false); } }
  }, [loadTenancy]);

  useEffect(() => {
    const requests = tenancyRequest;
    let disposed = false;
    let authEvent = 0;
    const applySession = (s: Session | null) => {
      if (disposed) return;
      const sameUser = !!s?.user && activeUser.current === s.user.id;
      if (activeUser.current && !sameUser) preferredBusiness.current = undefined;
      activeUser.current = s?.user.id ?? null;
      setSession(s);
      // Retain the user identity object so data hooks do not restart on token refresh.
      setUser(previous => sameUser ? previous : s?.user ?? null);
      if (sameUser && accountReady.current) {
        const request = ++tenancyRequest.current;
        setTimeout(() => { if (!disposed && request === tenancyRequest.current) void loadTenancy(s!.user.id, true); }, 0);
        return;
      }
      if (s?.user) setSignOutNotice(null);
      // Invalidate earlier account requests immediately, before the deferred load.
      const request = ++tenancyRequest.current;
      setBusiness(null); setRole(null); setFullName(null); setError(null);
      if (s?.user) {
        setLoading(true);
        setTimeout(() => { if (!disposed && request === tenancyRequest.current) void loadTenancy(s.user.id); }, 0);
      } else { preferredBusiness.current = undefined; setLoading(false); }
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => { authEvent++; applySession(s); });
    const initialEvent = authEvent;
    supabase.auth.getSession().then(({ data: { session: s }, error: sessionError }) => {
      if (disposed || initialEvent !== authEvent) return;
      if (sessionError) { setError('Could not load your account. Please try again.'); setLoading(false); return; }
      applySession(s);
    }).catch(() => {
      if (!disposed && initialEvent === authEvent) { setError('Could not load your account. Please try again.'); setLoading(false); }
    });
    return () => { disposed = true; requests.current++; sub.subscription.unsubscribe(); };
  }, [loadTenancy]);

  const signOut = async () => {
    setSignOutNotice(null);
    try { await signOutChecked(); }
    catch (error) {
      if (error instanceof SignOutError && error.localSignedOut) setSignOutNotice(error.message);
      throw error;
    }
  };

  return (
    <Ctx.Provider value={{ loading, error, session, user, fullName, business, role, hasPermission: can, signOut, signOutNotice, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
