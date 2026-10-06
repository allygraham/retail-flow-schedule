import { buildThemeStyle } from './brandingContext';
import { DEFAULT_THEME, type BrandingTheme } from './types';

const KEY = 'lavoro:theme:v1';
export interface CachedTheme { userId: string; businessId: string; theme: BrandingTheme }
const presets = new Set(['default', 'midnight', 'forest', 'sunset', 'slate', 'topdrawer']);
export const isWorkspacePath = (path: string) => /^\/(dashboard|rota|leave|profile|team|stores|settings)(\/|$)/.test(path);

export function readThemeCache(userId?: string): CachedTheme | null {
  try {
    if (!userId) {
      const project = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0];
      const session = JSON.parse(localStorage.getItem(`sb-${project}-auth-token`) ?? 'null');
      userId = session?.user?.id;
    }
    if (!userId) return null;
    const cached = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (cached?.version !== 1 || cached.userId !== userId || typeof cached.businessId !== 'string' || !cached.businessId || !presets.has(cached.theme?.themeKey)) return null;
    const theme = cached.theme;
    if (![theme.primaryColor, theme.secondaryColor, theme.accentColor, theme.surfaceColor].every(value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value))) return null;
    // Only a palette is cached; names and logos still come from the current workspace.
    return { userId, businessId: cached.businessId, theme: { ...DEFAULT_THEME, themeKey: theme.themeKey, primaryColor: theme.primaryColor, secondaryColor: theme.secondaryColor, accentColor: theme.accentColor, surfaceColor: theme.surfaceColor } };
  } catch { return null; }
}
export function saveThemeCache(userId: string, businessId: string, theme: BrandingTheme) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, userId, businessId, theme: { themeKey: theme.themeKey, primaryColor: theme.primaryColor, secondaryColor: theme.secondaryColor, accentColor: theme.accentColor, surfaceColor: theme.surfaceColor } }));
  } catch { /* Storage may be unavailable; the live theme still works. */ }
}
export function applyRootTheme(theme: BrandingTheme | null) {
  for (const [key, value] of Object.entries(buildThemeStyle(theme ?? DEFAULT_THEME))) {
    if (theme) document.documentElement.style.setProperty(key, value);
    else document.documentElement.style.removeProperty(key);
  }
}
export function bootstrapTheme() {
  if (isWorkspacePath(window.location.pathname)) {
    const cached = readThemeCache();
    if (cached) applyRootTheme(cached.theme);
  }
}
