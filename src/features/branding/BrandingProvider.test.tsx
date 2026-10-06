import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrandingProvider } from './BrandingProvider';
import { useBranding } from './brandingContext';
import { readThemeCache, saveThemeCache } from './themeCache';
import { DEFAULT_THEME } from './types';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn() }));
vi.mock('@/features/auth/authContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.query }) }) }),
  channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: vi.fn(),
} }));
const cached = { ...DEFAULT_THEME, primaryColor: '#123456' };
function Probe() {
  const { theme, previewTheme } = useBranding();
  return <><span data-testid="primary">{theme.primaryColor}</span><button onClick={() => previewTheme({ ...theme, primaryColor: '#abcdef' })}>Preview</button></>;
}
const view = () => <MemoryRouter initialEntries={['/rota']}><BrandingProvider><Probe /></BrandingProvider></MemoryRouter>;
beforeEach(() => { localStorage.clear(); mocks.query.mockReset(); mocks.auth.mockReturnValue({ user: { id: 'user' }, business: { id: 'business' }, loading: false }); saveThemeCache('user', 'business', cached); });
afterEach(() => { cleanup(); document.documentElement.removeAttribute('style'); });
it('keeps the cached palette while loading and after a failed refresh', async () => {
  mocks.query.mockResolvedValue({ data: null, error: { message: 'offline' } });
  render(view());
  expect(screen.getByTestId('primary')).toHaveTextContent('#123456');
  await waitFor(() => expect(mocks.query).toHaveBeenCalled());
  expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#123456');
});
it('caches fresh saved colours but never a preview', async () => {
  mocks.query.mockResolvedValue({ data: { primary_color: '#654321' }, error: null });
  render(view());
  await waitFor(() => expect(screen.getByTestId('primary')).toHaveTextContent('#654321'));
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  expect(screen.getByTestId('primary')).toHaveTextContent('#abcdef');
  expect(readThemeCache('user')?.theme.primaryColor).toBe('#654321');
});
it('ignores stale branding responses after changing workspace', async () => {
  let finish!: (value: { data: { primary_color: string }; error: null }) => void;
  mocks.query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  mocks.query.mockResolvedValue({ data: { primary_color: '#ffffff' }, error: null });
  const result = render(view());
  await waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(1));
  mocks.auth.mockReturnValue({ user: { id: 'user' }, business: { id: 'another-business' }, loading: false });
  result.rerender(view());
  await waitFor(() => expect(screen.getByTestId('primary')).toHaveTextContent('#ffffff'));
  await act(async () => finish({ data: { primary_color: '#999999' }, error: null }));
  expect(screen.getByTestId('primary')).toHaveTextContent('#ffffff');
  expect(readThemeCache('user')?.businessId).toBe('another-business');
});
