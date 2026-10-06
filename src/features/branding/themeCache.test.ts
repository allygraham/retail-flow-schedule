import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bootstrapTheme, readThemeCache, saveThemeCache } from './themeCache';
import { DEFAULT_THEME } from './types';
const theme = { ...DEFAULT_THEME, themeKey: 'forest' as const, primaryColor: '#123456', displayName: 'Private company', logoUrl: 'private-logo' };
beforeEach(() => { localStorage.clear(); vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); document.documentElement.removeAttribute('style'); history.replaceState(null, '', '/'); });
it('caches palette only and requires the same user', () => {
  saveThemeCache('user', 'business', theme);
  expect(readThemeCache('user')?.theme.primaryColor).toBe('#123456');
  expect(readThemeCache('user')?.theme.displayName).toBeNull();
  expect(localStorage.getItem('lavoro:theme:v1')).not.toContain('Private company');
  expect(readThemeCache('another')).toBeNull();
});
it('applies the palette before rendering only on authenticated workspace routes', () => {
  saveThemeCache('user', 'business', theme);
  localStorage.setItem('sb-example-auth-token', JSON.stringify({ user: { id: 'user' } }));
  history.replaceState(null, '', '/login'); bootstrapTheme();
  expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('');
  history.replaceState(null, '', '/rota'); bootstrapTheme();
  expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#123456');
});
it('ignores malformed or unsafe palette data', () => {
  localStorage.setItem('lavoro:theme:v1', 'broken'); expect(readThemeCache('user')).toBeNull();
  saveThemeCache('user', 'business', { ...theme, primaryColor: 'url(https://example.com)' });
  expect(readThemeCache('user')).toBeNull();
});
it('handles unavailable browser storage', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
  expect(readThemeCache('user')).toBeNull();
  expect(() => saveThemeCache('user', 'business', theme)).not.toThrow();
});
