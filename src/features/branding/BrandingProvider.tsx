import { Ctx, type BrandingState } from './brandingContext';
import { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/authContext';
import { BrandingTheme, DEFAULT_THEME, ThemePresetKey } from './types';
import { useLocation } from 'react-router-dom';
import { applyRootTheme, isWorkspacePath, readThemeCache, saveThemeCache } from './themeCache';

const toTheme = (data: Record<string, unknown> | null | undefined): BrandingTheme => ({
  displayName: (data?.display_name as string | null | undefined) ?? null,
  themeKey: ((data?.theme_key as ThemePresetKey | null | undefined) ?? DEFAULT_THEME.themeKey),
  primaryColor: (data?.primary_color as string | null | undefined) ?? DEFAULT_THEME.primaryColor,
  secondaryColor: (data?.secondary_color as string | null | undefined) ?? DEFAULT_THEME.secondaryColor,
  accentColor: (data?.accent_color as string | null | undefined) ?? DEFAULT_THEME.accentColor,
  surfaceColor: (data?.surface_color as string | null | undefined) ?? DEFAULT_THEME.surfaceColor,
  logoUrl: (data?.logo_url as string | null | undefined) ?? null,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { business, user, loading: accountLoading } = useAuth();
  const { pathname } = useLocation();
  const [saved, setSaved] = useState(() => readThemeCache());
  const [preview, setPreview] = useState<{ identity: string; theme: BrandingTheme } | null>(null);
  const [loading, setLoading] = useState(false);
  const identity = `${user?.id ?? ''}:${business?.id ?? ''}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const requestId = useRef(0);
  const cacheMatches = saved && (user ? saved.userId === user.id : accountLoading) && (business ? saved.businessId === business.id : accountLoading);
  const savedTheme = cacheMatches ? saved.theme : DEFAULT_THEME;

  useLayoutEffect(() => {
    if (!business || !user) return;
    const cached = readThemeCache(user.id);
    if (cached?.businessId === business.id) setSaved(previous => previous?.userId === user.id && previous.businessId === business.id ? previous : cached);
  }, [business, user]);

  const load = useCallback(async () => {
    const request = ++requestId.current;
    if (!business || !user) { setLoading(false); return; }
    const expectedIdentity = `${user.id}:${business.id}`;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('business_branding').select('*').eq('business_id', business.id).maybeSingle();
      if (request !== requestId.current || currentIdentity.current !== expectedIdentity) return;
      if (error) return; // Keep the last saved palette during a failed refresh.
      const theme = toTheme(data as Record<string, unknown> | null | undefined);
      setSaved({ userId: user.id, businessId: business.id, theme });
      saveThemeCache(user.id, business.id, theme);
    } catch { /* Keep the cached palette when the request unexpectedly fails. */ }
    finally { if (request === requestId.current) setLoading(false); }
  }, [business, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!business) return;
    const ch = supabase
      .channel(`branding:${business.id}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'business_branding',
        filter: `business_id=eq.${business.id}`,
      }, () => {
        void load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [business, load]);

  const previewTheme = useCallback((next: BrandingTheme | null) => setPreview(next && business ? { identity, theme: next } : null), [business, identity]);
  const clearPreviewTheme = useCallback(() => setPreview(null), []);
  const theme = preview?.identity === identity ? preview?.theme ?? savedTheme : savedTheme;
  useLayoutEffect(() => {
    applyRootTheme(isWorkspacePath(pathname) ? theme : null);
  }, [pathname, theme]);

  const value = useMemo<BrandingState>(() => ({
    theme,
    savedTheme,
    loading,
    refresh: load,
    previewTheme,
    clearPreviewTheme,
  }), [theme, savedTheme, loading, load, previewTheme, clearPreviewTheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
