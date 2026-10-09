import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { supabase } from '@/integrations/supabase/client';
// Visits are exploration milestones, never evidence that business setup was saved.
export function useOnboardingVisits() {
 const { business, user, role } = useAuth();
 const { pathname } = useLocation();
 const saved = useRef(new Set<string>());
 useEffect(() => {
  const step = role === 'employee' ? ({ '/profile': 'profile', '/rota': 'rota', '/leave': 'leave' } as Record<string, string>)[pathname]
    : role === 'manager' ? ({ '/team': 'team', '/leave': 'requests' } as Record<string, string>)[pathname] : null;
  if (!business || !user || !step) return;
  const key = `${business.id}:${user.id}:${role}:${step}`;
  if (saved.current.has(key)) return;
  let cancelled = false;
  void (async () => {
   try { const result = await supabase.rpc('update_onboarding', { _business_id: business.id, _action: 'explore', _step: step });
    if (cancelled) return;
    if (!result.error) saved.current.add(key);
   } catch { /* The dashboard reads saved progress afresh; visits can retry next time. */ }
  })();
  return () => { cancelled = true; };
 }, [business, user, role, pathname]);
}
