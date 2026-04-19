import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { readableForeground, shade, withAlpha } from './contrast';
import { BrandingTheme, DEFAULT_THEME } from './types';

type BrandingState = {
  theme: BrandingTheme;
  loading: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<BrandingState | undefined>(undefined);

function applyThemeToDocument(theme: BrandingTheme) {
  const root = document.documentElement;
  const fgPrimary = readableForeground(theme.primaryColor);
  const fgSecondary = readableForeground(theme.secondaryColor);
  const fgAccent = readableForeground(theme.accentColor);

  root.style.setProperty('--brand-primary', theme.primaryColor);
  root.style.setProperty('--brand-primary-fg', fgPrimary);
  root.style.setProperty('--brand-primary-soft', withAlpha(theme.primaryColor, 0.10));
  root.style.setProperty('--brand-primary-hover', shade(theme.primaryColor, -0.08));

  root.style.setProperty('--brand-secondary', theme.secondaryColor);
  root.style.setProperty('--brand-secondary-fg', fgSecondary);

  root.style.setProperty('--brand-accent', theme.accentColor);
  root.style.setProperty('--brand-accent-fg', fgAccent);

  root.style.setProperty('--brand-surface', theme.surfaceColor);
}

function resetTheme() {
  const root = document.documentElement;
  ['--brand-primary','--brand-primary-fg','--brand-primary-soft','--brand-primary-hover',
   '--brand-secondary','--brand-secondary-fg','--brand-accent','--brand-accent-fg','--brand-surface']
    .forEach(v => root.style.removeProperty(v));
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { business } = useAuth();
  const [theme, setTheme] = useState<BrandingTheme>(DEFAULT_THEME);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!business) {
      setTheme(DEFAULT_THEME);
      resetTheme();
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('business_branding')
      .select('*')
      .eq('business_id', business.id)
      .maybeSingle();
    const next: BrandingTheme = {
      displayName: data?.display_name ?? null,
      primaryColor: data?.primary_color ?? DEFAULT_THEME.primaryColor,
      secondaryColor: data?.secondary_color ?? DEFAULT_THEME.secondaryColor,
      accentColor: data?.accent_color ?? DEFAULT_THEME.accentColor,
      surfaceColor: data?.surface_color ?? DEFAULT_THEME.surfaceColor,
      logoUrl: data?.logo_url ?? null,
    };
    setTheme(next);
    applyThemeToDocument(next);
    setLoading(false);
  }, [business]);

  useEffect(() => { load(); }, [load]);

  // Realtime: live updates so other admins see new branding without refresh
  useEffect(() => {
    if (!business) return;
    const ch = supabase
      .channel(`branding:${business.id}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'business_branding', filter: `business_id=eq.${business.id}` },
        () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [business, load]);

  // Re-apply when theme changes (defensive — also done in load)
  useEffect(() => { applyThemeToDocument(theme); }, [theme]);

  const value = useMemo<BrandingState>(() => ({ theme, loading, refresh: load }), [theme, loading, load]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBranding() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBranding must be used inside BrandingProvider');
  return ctx;
}
