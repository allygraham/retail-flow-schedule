import type { BrandingTheme, ThemePresetKey } from './types';
import { hexToRgb, readableForeground, relativeLuminance, shade, withAlpha } from './contrast';

/**
 * Pick a foreground for a colored CTA / nav surface.
 * Unlike pure WCAG `readableForeground`, this biases toward WHITE for any
 * mid-to-dark background (luminance < 0.55). That avoids the visually-wrong
 * "dark text on dark sage" outcome where black technically wins the WCAG
 * ratio by a hair, but white reads as more intentional and on-brand.
 */
function ctaForeground(bgHex: string): string {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return '#ffffff';
  const L = relativeLuminance(rgb);
  if (L < 0.55) return '#ffffff';
  return readableForeground(bgHex);
}

export type ThemePreset = {
  key: ThemePresetKey;
  name: string;
  description: string;
  primaryColor: string;
  primaryHoverColor: string;
  bgColor: string;
  surfaceColor: string;
  sidebarColor: string;
  textPrimaryColor: string;
  textSecondaryColor: string;
  borderColor: string;
  successColor: string;
  warningColor: string;
  dangerColor: string;
  /** Optional explicit muted surface (warm off-white, etc). Falls back to derived tint. */
  surfaceMutedColor?: string;
  /** Optional explicit active sidebar item background. Falls back to primaryColor. */
  sidebarActiveColor?: string;
  /** Optional explicit foreground for primary CTAs. Falls back to ctaForeground(primaryColor). */
  onPrimaryColor?: string;
  /** Optional explicit foreground for the active sidebar item. Falls back to ctaForeground(navActiveBg). */
  onSidebarActiveColor?: string;
  /** Optional explicit muted/helper text inside the sidebar. */
  sidebarTextMutedColor?: string;
  /** Optional explicit divider/border color inside the sidebar. */
  sidebarBorderColor?: string;
};

export type ResolvedThemePreset = Omit<
  ThemePreset,
  'surfaceMutedColor' | 'sidebarActiveColor' | 'onPrimaryColor' | 'onSidebarActiveColor' | 'sidebarTextMutedColor' | 'sidebarBorderColor'
> & {
  sidebarTextColor: string;
  sidebarTextMutedColor: string;
  sidebarBorderColor: string;
  primaryTextColor: string;
  onPrimaryColor: string;
  onSidebarActiveColor: string;
  surfaceMutedColor: string;
  surfaceRaisedColor: string;
  borderStrongColor: string;
  neutralBadgeBg: string;
  neutralBadgeText: string;
  successBg: string;
  successText: string;
  warningBg: string;
  warningText: string;
  dangerBg: string;
  dangerText: string;
  rowHoverColor: string;
  sidebarHoverColor: string;
  navActiveBg: string;
  navActiveText: string;
  inputBg: string;
  placeholderColor: string;
  focusRingColor: string;
  overlayColor: string;
};

export const THEME_PRESETS: Record<ThemePresetKey, ThemePreset> = {
  default: {
    key: 'default',
    name: 'Default',
    description: 'Confident indigo with crisp neutral surfaces.',
    primaryColor: '#5B5FEF',
    primaryHoverColor: '#4A4ED8',
    bgColor: '#F8F9FC',
    surfaceColor: '#FFFFFF',
    sidebarColor: '#0F172A',
    textPrimaryColor: '#0B1220',
    textSecondaryColor: '#64748B',
    borderColor: '#E2E8F0',
    successColor: '#22C55E',
    warningColor: '#F59E0B',
    dangerColor: '#EF4444',
  },
  midnight: {
    key: 'midnight',
    name: 'Midnight',
    description: 'Dark, polished and high-contrast for focused teams.',
    primaryColor: '#7C82FF',
    primaryHoverColor: '#6B70F0',
    bgColor: '#0B1220',
    surfaceColor: '#111827',
    sidebarColor: '#020617',
    textPrimaryColor: '#F1F5F9',
    textSecondaryColor: '#94A3B8',
    borderColor: '#1E293B',
    successColor: '#22C55E',
    warningColor: '#FBBF24',
    dangerColor: '#F87171',
  },
  forest: {
    key: 'forest',
    name: 'Forest',
    description: 'Calm operational green with fresh light surfaces.',
    primaryColor: '#16A34A',
    primaryHoverColor: '#15803D',
    bgColor: '#F7FDF9',
    surfaceColor: '#FFFFFF',
    sidebarColor: '#052E16',
    textPrimaryColor: '#052E16',
    textSecondaryColor: '#4D7C0F',
    borderColor: '#D1FAE5',
    successColor: '#22C55E',
    warningColor: '#F59E0B',
    dangerColor: '#DC2626',
  },
  sunset: {
    key: 'sunset',
    name: 'Sunset',
    description: 'Warm retail energy grounded by deep brown navigation.',
    primaryColor: '#F97316',
    primaryHoverColor: '#EA580C',
    bgColor: '#FFF7ED',
    surfaceColor: '#FFFFFF',
    sidebarColor: '#431407',
    textPrimaryColor: '#1C1917',
    textSecondaryColor: '#78716C',
    borderColor: '#FED7AA',
    successColor: '#16A34A',
    warningColor: '#F59E0B',
    dangerColor: '#DC2626',
  },
  slate: {
    key: 'slate',
    name: 'Slate',
    description: 'Muted executive neutrals with restrained contrast.',
    primaryColor: '#475569',
    primaryHoverColor: '#334155',
    bgColor: '#F8FAFC',
    surfaceColor: '#FFFFFF',
    sidebarColor: '#020617',
    textPrimaryColor: '#020617',
    textSecondaryColor: '#64748B',
    borderColor: '#E2E8F0',
    successColor: '#16A34A',
    warningColor: '#D97706',
    dangerColor: '#DC2626',
  },
  topdrawer: {
    key: 'topdrawer',
    name: 'Top Drawer',
    description: 'Premium retail warmth with sage green accents and muted charcoal nav.',
    primaryColor: '#747C61',
    primaryHoverColor: '#687157',
    bgColor: '#FAF3EE',
    surfaceColor: '#FFFFFF',
    sidebarColor: '#4C4E56',
    textPrimaryColor: '#2F3035',
    textSecondaryColor: '#66696E',
    borderColor: '#E8E4DF',
    successColor: '#16A34A',
    warningColor: '#D97706',
    dangerColor: '#DC2626',
    surfaceMutedColor: '#F4EDE3',
    sidebarActiveColor: '#747C61',
    onPrimaryColor: '#FFFFFF',
    onSidebarActiveColor: '#FFFFFF',
    sidebarTextMutedColor: '#E8E4DF',
    sidebarBorderColor: 'rgba(240, 228, 215, 0.16)',
  },
};

export const THEME_ORDER: ThemePresetKey[] = ['default', 'midnight', 'forest', 'sunset', 'slate', 'topdrawer'];

export function getThemePreset(themeKey?: string | null): ResolvedThemePreset {
  const base = themeKey && themeKey in THEME_PRESETS
    ? THEME_PRESETS[themeKey as ThemePresetKey]
    : THEME_PRESETS.default;

  const sidebarTextColor = readableForeground(base.sidebarColor);
  const primaryTextColor = readableForeground(base.primaryColor);
  const neutralBadgeBg = withAlpha(base.textPrimaryColor, base.key === 'midnight' ? 0.16 : 0.06);
  const neutralBadgeText = base.textSecondaryColor;

  const navActiveBg = base.sidebarActiveColor ?? base.primaryColor;
  const onPrimaryColor = base.onPrimaryColor ?? ctaForeground(base.primaryColor);
  const onSidebarActiveColor = base.onSidebarActiveColor ?? ctaForeground(navActiveBg);
  const sidebarTextMutedColor =
    base.sidebarTextMutedColor ?? withAlpha(sidebarTextColor, 0.7);
  const sidebarBorderColor =
    base.sidebarBorderColor ?? withAlpha(sidebarTextColor, 0.16);

  return {
    ...base,
    sidebarTextColor,
    sidebarTextMutedColor,
    sidebarBorderColor,
    primaryTextColor: onPrimaryColor,
    onPrimaryColor,
    onSidebarActiveColor,
    surfaceMutedColor: base.surfaceMutedColor ?? withAlpha(base.textPrimaryColor, base.key === 'midnight' ? 0.06 : 0.035),
    surfaceRaisedColor: shade(base.surfaceColor, base.key === 'midnight' ? 0.04 : 0),
    borderStrongColor: shade(base.borderColor, -0.08),
    neutralBadgeBg,
    neutralBadgeText,
    successBg: withAlpha(base.successColor, base.key === 'midnight' ? 0.18 : 0.13),
    successText: base.key === 'midnight' ? shade(base.successColor, 0.25) : shade(base.successColor, -0.35),
    warningBg: withAlpha(base.warningColor, base.key === 'midnight' ? 0.2 : 0.16),
    warningText: base.key === 'midnight' ? shade(base.warningColor, 0.16) : shade(base.warningColor, -0.42),
    dangerBg: withAlpha(base.dangerColor, base.key === 'midnight' ? 0.2 : 0.13),
    dangerText: base.key === 'midnight' ? shade(base.dangerColor, 0.16) : shade(base.dangerColor, -0.28),
    rowHoverColor: withAlpha(base.primaryColor, base.key === 'midnight' ? 0.14 : 0.08),
    sidebarHoverColor: withAlpha(sidebarTextColor, base.key === 'midnight' ? 0.08 : 0.1),
    navActiveBg,
    navActiveText: onSidebarActiveColor,
    inputBg: base.surfaceColor,
    placeholderColor: withAlpha(base.textSecondaryColor, 0.86),
    focusRingColor: withAlpha(base.primaryColor, 0.22),
    overlayColor: withAlpha(base.sidebarColor, 0.62),
  };
}

export function themeFromPreset(themeKey: ThemePresetKey, overrides?: Partial<BrandingTheme>): BrandingTheme {
  const preset = getThemePreset(themeKey);
  return {
    displayName: overrides?.displayName ?? null,
    themeKey,
    primaryColor: preset.primaryColor,
    secondaryColor: preset.sidebarColor,
    accentColor: preset.successColor,
    surfaceColor: preset.surfaceColor,
    logoUrl: overrides?.logoUrl ?? null,
  };
}
