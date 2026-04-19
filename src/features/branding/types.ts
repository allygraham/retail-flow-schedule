export type BrandingTheme = {
  displayName: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  surfaceColor: string;
  logoUrl: string | null;
};

export const DEFAULT_THEME: BrandingTheme = {
  displayName: null,
  primaryColor: '#4f46e5', // indigo-600
  secondaryColor: '#0f172a', // ink-900 (sidebar)
  accentColor: '#f59e0b', // amber-500
  surfaceColor: '#f8fafc', // ink-50 (page bg)
  logoUrl: null,
};
