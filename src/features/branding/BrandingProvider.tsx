import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { readableForeground, shade, withAlpha } from './contrast';
import { BrandingTheme, DEFAULT_THEME } from './types';
import { getThemePreset } from './presets';

type BrandingState = {
  theme: BrandingTheme;
  loading: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<BrandingState | undefined>(undefined);

/**
 * Build inline style object for tenant theme — applied to a SCOPED wrapper,
 * never to :root. This prevents tenant branding from leaking into public pages.
 */
export function buildThemeStyle(theme: BrandingTheme): React.CSSProperties {
  const preset = getThemePreset(theme.themeKey);
  const fgPrimary = readableForeground(theme.primaryColor);
  const fgSecondary = readableForeground(theme.secondaryColor);
  const fgAccent = readableForeground(theme.accentColor);
  return {
    ['--brand-primary' as any]: theme.primaryColor,
    ['--brand-primary-fg' as any]: fgPrimary,
    ['--brand-primary-soft' as any]: withAlpha(theme.primaryColor, 0.10),
    ['--brand-primary-hover' as any]: shade(theme.primaryColor, -0.08),
    ['--brand-secondary' as any]: theme.secondaryColor,
    ['--brand-secondary-fg' as any]: fgSecondary,
    ['--brand-accent' as any]: theme.accentColor,
    ['--brand-accent-fg' as any]: fgAccent,
    ['--brand-surface' as any]: theme.surfaceColor,
    ['--theme-surface' as any]: theme.surfaceColor,
    ['--theme-surface-elevated' as any]: preset.surfaceElevatedColor,
    ['--theme-sidebar' as any]: preset.sidebarColor,
    ['--theme-sidebar-hover' as any]: preset.sidebarHoverColor,
    ['--theme-text' as any]: preset.textColor,
    ['--theme-text-muted' as any]: preset.mutedTextColor,
    ['--theme-border' as any]: preset.borderColor,
    ['--theme-badge-bg' as any]: preset.badgeBg,
    ['--theme-badge-text' as any]: preset.badgeText,
    ['--theme-status-approved-bg' as any]: preset.approvedBg,
    ['--theme-status-approved-text' as any]: preset.approvedText,
    ['--theme-status-pending-bg' as any]: preset.pendingBg,
    ['--theme-status-pending-text' as any]: preset.pendingText,
    ['--theme-status-declined-bg' as any]: preset.declinedBg,
    ['--theme-status-declined-text' as any]: preset.declinedText,
    ['--theme-focus-ring' as any]: withAlpha(theme.primaryColor, 0.22),
    ['--theme-row-highlight' as any]: withAlpha(theme.primaryColor, 0.08),
  };
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { business } = useAuth();
  const [theme, setTheme] = useState<BrandingTheme>(DEFAULT_THEME);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!business) {
      setTheme(DEFAULT_THEME);
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
      themeKey: data?.theme_key ?? DEFAULT_THEME.themeKey,
      primaryColor: data?.primary_color ?? DEFAULT_THEME.primaryColor,
      secondaryColor: data?.secondary_color ?? DEFAULT_THEME.secondaryColor,
      accentColor: data?.accent_color ?? DEFAULT_THEME.accentColor,
      surfaceColor: data?.surface_color ?? DEFAULT_THEME.surfaceColor,
      logoUrl: data?.logo_url ?? null,
    };
    setTheme(next);
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

  const value = useMemo<BrandingState>(() => ({ theme, loading, refresh: load }), [theme, loading, load]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBranding() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBranding must be used inside BrandingProvider');
  return ctx;
}
