import React, { createContext, useContext } from 'react';
import { getThemePreset } from './presets';
import type { BrandingTheme } from './types';

const hexWithFallback = (value: string | null | undefined, fallback: string) => value ?? fallback;

export type BrandingState = {
  theme: BrandingTheme;
  savedTheme: BrandingTheme;
  loading: boolean;
  refresh: () => Promise<void>;
  previewTheme: (next: BrandingTheme | null) => void;
  clearPreviewTheme: () => void;
};

export const Ctx = createContext<BrandingState | undefined>(undefined);

export function buildThemeStyle(theme: BrandingTheme): React.CSSProperties & Record<`--${string}`, string> {
  const preset = getThemePreset(theme.themeKey);
  const primary = hexWithFallback(theme.primaryColor, preset.primaryColor);
  const surface = hexWithFallback(theme.surfaceColor, preset.surfaceColor);
  const sidebar = hexWithFallback(theme.secondaryColor, preset.sidebarColor);

  return {
    '--color-primary': primary,
    '--color-primary-hover': preset.primaryHoverColor,
    '--color-on-primary': preset.onPrimaryColor,
    '--color-bg': preset.bgColor,
    '--color-surface': surface,
    '--color-surface-muted': preset.surfaceMutedColor,
    '--color-surface-raised': preset.surfaceRaisedColor,
    '--color-sidebar': sidebar,
    '--color-sidebar-text': preset.sidebarTextColor,
    '--color-sidebar-text-muted': preset.sidebarTextMutedColor,
    '--color-sidebar-active': preset.navActiveBg,
    '--color-on-sidebar-active': preset.onSidebarActiveColor,
    '--color-sidebar-border': preset.sidebarBorderColor,
    '--color-sidebar-hover': preset.sidebarHoverColor,
    '--color-text-primary': preset.textPrimaryColor,
    '--color-text-secondary': preset.textSecondaryColor,
    '--color-text-inverse': preset.sidebarTextColor,
    '--color-text-on-primary': preset.onPrimaryColor,
    '--color-border': preset.borderColor,
    '--color-border-strong': preset.borderStrongColor,
    '--color-success': preset.successColor,
    '--color-success-bg': preset.successBg,
    '--color-success-text': preset.successText,
    '--color-warning': preset.warningColor,
    '--color-warning-bg': preset.warningBg,
    '--color-warning-text': preset.warningText,
    '--color-danger': preset.dangerColor,
    '--color-danger-bg': preset.dangerBg,
    '--color-danger-text': preset.dangerText,
    '--color-neutral-badge-bg': preset.neutralBadgeBg,
    '--color-neutral-badge-text': preset.neutralBadgeText,
    '--color-nav-active-bg': preset.navActiveBg,
    '--color-nav-active-text': preset.navActiveText,
    '--color-row-hover': preset.rowHoverColor,
    '--color-input-bg': preset.inputBg,
    '--color-placeholder': preset.placeholderColor,
    '--color-focus-ring': preset.focusRingColor,
    '--color-overlay': preset.overlayColor,

    '--brand-primary': primary,
    '--brand-primary-fg': preset.primaryTextColor,
    '--brand-primary-soft': preset.rowHoverColor,
    '--brand-primary-hover': preset.primaryHoverColor,
    '--brand-secondary': sidebar,
    '--brand-secondary-fg': preset.sidebarTextColor,
    '--brand-accent': preset.successColor,
    '--brand-accent-fg': preset.primaryTextColor,
    '--brand-surface': preset.bgColor,
    '--theme-surface': preset.bgColor,
    '--theme-surface-elevated': surface,
    '--theme-sidebar': sidebar,
    '--theme-sidebar-hover': preset.sidebarHoverColor,
    '--theme-text': preset.textPrimaryColor,
    '--theme-text-muted': preset.textSecondaryColor,
    '--theme-border': preset.borderColor,
    '--theme-badge-bg': preset.neutralBadgeBg,
    '--theme-badge-text': preset.neutralBadgeText,
    '--theme-status-approved-bg': preset.successBg,
    '--theme-status-approved-text': preset.successText,
    '--theme-status-pending-bg': preset.warningBg,
    '--theme-status-pending-text': preset.warningText,
    '--theme-status-declined-bg': preset.dangerBg,
    '--theme-status-declined-text': preset.dangerText,
    '--theme-focus-ring': preset.focusRingColor,
    '--theme-row-highlight': preset.rowHoverColor,
  };
}

export function useBranding() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBranding must be used inside BrandingProvider');
  return ctx;
}

export function useOptionalBranding() { return useContext(Ctx); }
