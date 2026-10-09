import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InitialPageLoader } from './InitialPageLoader';
const auth = vi.hoisted(() => vi.fn());
vi.mock('@/features/auth/authContext', () => ({ useOptionalAuth: auth }));
beforeEach(() => { localStorage.clear(); auth.mockReturnValue({ loading: true, user: null }); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
function show(path: string) { render(<MemoryRouter initialEntries={[path]}><InitialPageLoader /></MemoryRouter>); }
it.each(['/login', '/signup', '/forgot-password', '/reset-password', '/accept-invite'])('uses the centred card on %s even with a signed-in account', path => {
  auth.mockReturnValue({ loading: false, user: { id: 'user' } }); show(path);
  expect(screen.getByRole('status', { name: 'Loading page' })).toHaveAttribute('data-loading-layout', 'auth');
});
it('uses a workspace frame for an authenticated account', () => {
  auth.mockReturnValue({ loading: true, user: { id: 'user' } }); show('/dashboard');
  expect(screen.getByRole('status', { name: 'Loading page' })).toHaveAttribute('data-loading-layout', 'workspace');
});
it('handles unavailable or invalid session storage without claiming authentication', () => {
  localStorage.setItem('sb-example-auth-token', '{'); show('/');
  expect(screen.getByRole('status', { name: 'Loading page' })).toHaveAttribute('data-loading-layout', 'auth');
});

it('uses a saved session only while account verification is pending', () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  localStorage.setItem('sb-example-auth-token', JSON.stringify({ access_token: 'hint', user: { id: 'user' } }));
  show('/dashboard');
  expect(screen.getByRole('status', { name: 'Loading page' })).toHaveAttribute('data-loading-layout', 'workspace');
  cleanup(); auth.mockReturnValue({ loading: false, user: null }); show('/dashboard');
  expect(screen.getByRole('status', { name: 'Loading page' })).toHaveAttribute('data-loading-layout', 'auth');
});
