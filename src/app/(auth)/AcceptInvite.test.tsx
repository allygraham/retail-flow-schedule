import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AcceptInvite from './AcceptInvite';

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(), rpc: vi.fn(), refresh: vi.fn(), signOut: vi.fn(), nav: vi.fn(),
  auth: { user: null as { id: string; email?: string; user_metadata?: { business_name?: string } } | null, loading: false },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { signUp: mocks.signUp }, rpc: mocks.rpc } }));
vi.mock('@/features/auth/authContext', () => ({ useOptionalAuth: () => undefined, useAuth: () => ({ ...mocks.auth, refresh: mocks.refresh, signOut: mocks.signOut }) }));
vi.mock('react-router-dom', async () => ({ ...await vi.importActual('react-router-dom'), useNavigate: () => mocks.nav }));
const invitation = { id: 'invite', business_id: 'business', business_name: 'Test shop', email: 'employee@example.com', full_name: 'Test Employee', role: 'employee', status: 'pending', expires_at: '2099-01-01' };
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = { user: null, loading: false };
  mocks.rpc.mockImplementation((name: string) => Promise.resolve({ data: name === 'get_invitation_by_token' ? [invitation] : 'business', error: null }));
  mocks.refresh.mockResolvedValue(undefined);
});
const showInvite = async () => {
  render(<MemoryRouter initialEntries={['/accept-invite?token=test-token']}><AcceptInvite /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Join Test shop' });
};
const signup = () => {
  fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'StrongPassword123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Activate account' }));
};

describe('employee invitation onboarding', () => {
  it('waits for email confirmation without trying to sign in or accept anonymously', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    await showInvite(); signup();
    await screen.findByRole('status');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.nav).not.toHaveBeenCalled();
    expect(mocks.signUp.mock.calls[0][0].options.emailRedirectTo).toContain('/accept-invite?token=test-token');
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
  it('accepts after confirmation without signing up again and refreshes the joined business', async () => {
    mocks.auth.user = { id: 'confirmed', email: invitation.email };
    await showInvite();
    fireEvent.click(screen.getByRole('button', { name: 'Join team' }));
    await waitFor(() => expect(mocks.nav).toHaveBeenCalledWith('/dashboard', { replace: true }));
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('accept_invitation', { _token: 'test-token' });
    expect(mocks.refresh).toHaveBeenCalledWith('business');
  });
  it('accepts immediately when signup supplies an authenticated session', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { user: { id: 'new', email: invitation.email } } }, error: null });
    await showInvite(); signup();
    await waitFor(() => expect(mocks.nav).toHaveBeenCalled());
    expect(mocks.rpc).toHaveBeenCalledWith('accept_invitation', { _token: 'test-token' });
  });
  it('keeps the invitation token when an existing account signs in', async () => {
    await showInvite();
    const link = screen.getByRole('link', { name: 'Sign in' });
    const url = new URL(link.getAttribute('href')!, 'https://app.example');
    expect(url.searchParams.get('next')).toBe('/accept-invite?token=test-token');
  });
  it('does not accept an invitation from a different signed-in account', async () => {
    mocks.auth.user = { id: 'wrong', email: 'other@example.com' };
    await showInvite();
    expect(screen.queryByRole('button', { name: 'Join team' })).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/You are signed in as/)).toBeInTheDocument();
  });
  it('takes already accepted invitations through normal sign-in', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...invitation, status: 'accepted' }], error: null });
    render(<MemoryRouter initialEntries={['/accept-invite?token=test-token']}><AcceptInvite /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Already accepted' });
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });
  it('shows acceptance failures without redirecting or hiding them', async () => {
    mocks.auth.user = { id: 'confirmed', email: invitation.email };
    mocks.rpc.mockImplementation((name: string) => Promise.resolve(name === 'get_invitation_by_token' ? { data: [invitation], error: null } : { data: null, error: { message: 'Invite expired' } }));
    await showInvite();
    fireEvent.click(screen.getByRole('button', { name: 'Join team' }));
    await screen.findByText('Invite expired');
    expect(mocks.nav).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
