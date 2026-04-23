import type { BrandingTheme, ThemePresetKey } from './types';

export type ThemePreset = {
  key: ThemePresetKey;
  name: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  surfaceColor: string;
  surfaceElevatedColor: string;
  sidebarColor: string;
  sidebarHoverColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  approvedBg: string;
  approvedText: string;
  pendingBg: string;
  pendingText: string;
  declinedBg: string;
  declinedText: string;
  badgeBg: string;
  badgeText: string;
};

export const THEME_PRESETS: Record<ThemePresetKey, ThemePreset> = {
  default: {
    key: 'default',
    name: 'Default',
    description: 'Confident indigo with warm scheduling accents.',
    primaryColor: '#4f46e5',
    secondaryColor: '#0f172a',
    accentColor: '#f59e0b',
    surfaceColor: '#f8fafc',
    surfaceElevatedColor: '#ffffff',
    sidebarColor: '#0f172a',
    sidebarHoverColor: '#1e293b',
    textColor: '#0f172a',
    mutedTextColor: '#64748b',
    borderColor: '#e2e8f0',
    approvedBg: '#dcfce7',
    approvedText: '#166534',
    pendingBg: '#fef3c7',
    pendingText: '#92400e',
    declinedBg: '#fee2e2',
    declinedText: '#991b1b',
    badgeBg: '#eef2ff',
    badgeText: '#4338ca',
  },
  dark: {
    key: 'dark',
    name: 'Dark',
    description: 'High-contrast charcoal workspace with electric highlights.',
    primaryColor: '#60a5fa',
    secondaryColor: '#020617',
    accentColor: '#22c55e',
    surfaceColor: '#0f172a',
    surfaceElevatedColor: '#111827',
    sidebarColor: '#020617',
    sidebarHoverColor: '#111827',
    textColor: '#e5eefb',
    mutedTextColor: '#94a3b8',
    borderColor: '#1e293b',
    approvedBg: '#052e16',
    approvedText: '#86efac',
    pendingBg: '#3b2f05',
    pendingText: '#fcd34d',
    declinedBg: '#3f1015',
    declinedText: '#fda4af',
    badgeBg: '#172554',
    badgeText: '#bfdbfe',
  },
  light: {
    key: 'light',
    name: 'Light',
    description: 'Minimal, bright and neutral for clean daily operations.',
    primaryColor: '#2563eb',
    secondaryColor: '#e2e8f0',
    accentColor: '#14b8a6',
    surfaceColor: '#fdfefe',
    surfaceElevatedColor: '#ffffff',
    sidebarColor: '#f1f5f9',
    sidebarHoverColor: '#e2e8f0',
    textColor: '#0f172a',
    mutedTextColor: '#475569',
    borderColor: '#dbe4ee',
    approvedBg: '#dcfce7',
    approvedText: '#166534',
    pendingBg: '#fef3c7',
    pendingText: '#92400e',
    declinedBg: '#fee2e2',
    declinedText: '#991b1b',
    badgeBg: '#dbeafe',
    badgeText: '#1d4ed8',
  },
  green: {
    key: 'green',
    name: 'Green',
    description: 'Operations-led palette with calm success-first cues.',
    primaryColor: '#15803d',
    secondaryColor: '#052e16',
    accentColor: '#84cc16',
    surfaceColor: '#f6fef9',
    surfaceElevatedColor: '#ffffff',
    sidebarColor: '#14532d',
    sidebarHoverColor: '#166534',
    textColor: '#0f2f1c',
    mutedTextColor: '#4d6b5a',
    borderColor: '#d7eadb',
    approvedBg: '#dcfce7',
    approvedText: '#166534',
    pendingBg: '#ecfccb',
    pendingText: '#3f6212',
    declinedBg: '#fee2e2',
    declinedText: '#991b1b',
    badgeBg: '#dcfce7',
    badgeText: '#166534',
  },
  orange: {
    key: 'orange',
    name: 'Orange',
    description: 'Warm retail tone with energetic, approachable contrast.',
    primaryColor: '#ea580c',
    secondaryColor: '#431407',
    accentColor: '#f59e0b',
    surfaceColor: '#fffaf5',
    surfaceElevatedColor: '#ffffff',
    sidebarColor: '#7c2d12',
    sidebarHoverColor: '#9a3412',
    textColor: '#431407',
    mutedTextColor: '#7c5a4b',
    borderColor: '#fed7aa',
    approvedBg: '#dcfce7',
    approvedText: '#166534',
    pendingBg: '#ffedd5',
    pendingText: '#9a3412',
    declinedBg: '#fee2e2',
    declinedText: '#991b1b',
    badgeBg: '#ffedd5',
    badgeText: '#c2410c',
  },
};

export const THEME_ORDER: ThemePresetKey[] = ['default', 'dark', 'light', 'green', 'orange'];

export function getThemePreset(themeKey?: string | null): ThemePreset {
  if (themeKey && themeKey in THEME_PRESETS) {
    return THEME_PRESETS[themeKey as ThemePresetKey];
  }
  return THEME_PRESETS.default;
}

export function themeFromPreset(themeKey: ThemePresetKey, overrides?: Partial<BrandingTheme>): BrandingTheme {
  const preset = THEME_PRESETS[themeKey];
  return {
    displayName: overrides?.displayName ?? null,
    themeKey,
    primaryColor: preset.primaryColor,
    secondaryColor: preset.secondaryColor,
    accentColor: preset.accentColor,
    surfaceColor: preset.surfaceColor,
    logoUrl: overrides?.logoUrl ?? null,
  };
}