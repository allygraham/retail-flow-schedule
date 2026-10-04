import { Ctx, type BrandingState } from './brandingContext';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/authContext';
import { BrandingTheme, DEFAULT_THEME, ThemePresetKey } from './types';

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
  const { business } = useAuth();
  const [savedTheme, setSavedTheme] = useState<BrandingTheme>(DEFAULT_THEME);
  const [preview, setPreview] = useState<BrandingTheme | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!business) {
      setSavedTheme(DEFAULT_THEME);
      setPreview(null);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('business_branding')
      .select('*')
      .eq('business_id', business.id)
      .maybeSingle();
    setSavedTheme(toTheme(data as Record<string, unknown> | null | undefined));
    setLoading(false);
  }, [business]);

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

  const previewTheme = useCallback((next: BrandingTheme | null) => setPreview(next), []);
  const clearPreviewTheme = useCallback(() => setPreview(null), []);
  const theme = preview ?? savedTheme;

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
