import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { getThemePreset } from './presets';
import { BrandingTheme, DEFAULT_THEME, ThemePresetKey } from './types';

const hexWithFallback = (value: string | null | undefined, fallback: string) => value ?? fallback;

type BrandingState = {
  theme: BrandingTheme;
  savedTheme: BrandingTheme;
  loading: boolean;
  refresh: () => Promise<void>;
  previewTheme: (next: BrandingTheme | null) => void;
  clearPreviewTheme: () => void;
};

const Ctx = createContext<BrandingState | undefined>(undefined);

export function buildThemeStyle(theme: BrandingTheme): React.CSSProperties {
  const preset = getThemePreset(theme.themeKey);
  const primary = hexWithFallback(theme.primaryColor, preset.primaryColor);
  const surface = hexWithFallback(theme.surfaceColor, preset.surfaceColor);
  const sidebar = hexWithFallback(theme.secondaryColor, preset.sidebarColor);

  return {
    ['--color-primary' as any]: primary,
    ['--color-primary-hover' as any]: preset.primaryHoverColor,
    ['--color-on-primary' as any]: preset.onPrimaryColor,
    ['--color-bg' as any]: preset.bgColor,
    ['--color-surface' as any]: surface,
    ['--color-surface-muted' as any]: preset.surfaceMutedColor,
    ['--color-surface-raised' as any]: preset.surfaceRaisedColor,
    ['--color-sidebar' as any]: sidebar,
    ['--color-sidebar-text' as any]: preset.sidebarTextColor,
    ['--color-sidebar-text-muted' as any]: preset.sidebarTextMutedColor,
    ['--color-sidebar-active' as any]: preset.navActiveBg,
    ['--color-on-sidebar-active' as any]: preset.onSidebarActiveColor,
    ['--color-sidebar-border' as any]: preset.sidebarBorderColor,
    ['--color-sidebar-hover' as any]: preset.sidebarHoverColor,
    ['--color-text-primary' as any]: preset.textPrimaryColor,
    ['--color-text-secondary' as any]: preset.textSecondaryColor,
    ['--color-text-inverse' as any]: preset.sidebarTextColor,
    ['--color-text-on-primary' as any]: preset.onPrimaryColor,
    ['--color-border' as any]: preset.borderColor,
    ['--color-border-strong' as any]: preset.borderStrongColor,
    ['--color-success' as any]: preset.successColor,
    ['--color-success-bg' as any]: preset.successBg,
    ['--color-success-text' as any]: preset.successText,
    ['--color-warning' as any]: preset.warningColor,
    ['--color-warning-bg' as any]: preset.warningBg,
    ['--color-warning-text' as any]: preset.warningText,
    ['--color-danger' as any]: preset.dangerColor,
    ['--color-danger-bg' as any]: preset.dangerBg,
    ['--color-danger-text' as any]: preset.dangerText,
    ['--color-neutral-badge-bg' as any]: preset.neutralBadgeBg,
    ['--color-neutral-badge-text' as any]: preset.neutralBadgeText,
    ['--color-nav-active-bg' as any]: preset.navActiveBg,
    ['--color-nav-active-text' as any]: preset.navActiveText,
    ['--color-row-hover' as any]: preset.rowHoverColor,
    ['--color-input-bg' as any]: preset.inputBg,
    ['--color-placeholder' as any]: preset.placeholderColor,
    ['--color-focus-ring' as any]: preset.focusRingColor,
    ['--color-overlay' as any]: preset.overlayColor,

    ['--brand-primary' as any]: primary,
    ['--brand-primary-fg' as any]: preset.primaryTextColor,
    ['--brand-primary-soft' as any]: preset.rowHoverColor,
    ['--brand-primary-hover' as any]: preset.primaryHoverColor,
    ['--brand-secondary' as any]: sidebar,
    ['--brand-secondary-fg' as any]: preset.sidebarTextColor,
    ['--brand-accent' as any]: preset.successColor,
    ['--brand-accent-fg' as any]: preset.primaryTextColor,
    ['--brand-surface' as any]: preset.bgColor,
    ['--theme-surface' as any]: preset.bgColor,
    ['--theme-surface-elevated' as any]: surface,
    ['--theme-sidebar' as any]: sidebar,
    ['--theme-sidebar-hover' as any]: preset.sidebarHoverColor,
    ['--theme-text' as any]: preset.textPrimaryColor,
    ['--theme-text-muted' as any]: preset.textSecondaryColor,
    ['--theme-border' as any]: preset.borderColor,
    ['--theme-badge-bg' as any]: preset.neutralBadgeBg,
    ['--theme-badge-text' as any]: preset.neutralBadgeText,
    ['--theme-status-approved-bg' as any]: preset.successBg,
    ['--theme-status-approved-text' as any]: preset.successText,
    ['--theme-status-pending-bg' as any]: preset.warningBg,
    ['--theme-status-pending-text' as any]: preset.warningText,
    ['--theme-status-declined-bg' as any]: preset.dangerBg,
    ['--theme-status-declined-text' as any]: preset.dangerText,
    ['--theme-focus-ring' as any]: preset.focusRingColor,
    ['--theme-row-highlight' as any]: preset.rowHoverColor,
  };
}

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

export function useBranding() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBranding must be used inside BrandingProvider');
  return ctx;
}
