export type ThemePresetKey = 'default' | 'midnight' | 'forest' | 'sunset' | 'slate' | 'topdrawer';

export type BrandingTheme = {
  displayName: string | null;
  themeKey: ThemePresetKey;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  surfaceColor: string;
  logoUrl: string | null;
};

export const DEFAULT_THEME: BrandingTheme = {
  displayName: null,
  themeKey: 'default',
  primaryColor: '#5B5FEF',
  secondaryColor: '#0F172A',
  accentColor: '#22C55E',
  surfaceColor: '#FFFFFF',
  logoUrl: null,
};
