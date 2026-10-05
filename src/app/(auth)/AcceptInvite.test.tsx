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
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', expect.stringContaining('/login?next='));
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

describe('invitation edge cases', () => {
  it.each(['revoked', 'expired'])('blocks %s invitations before account creation', async (status) => {
    mocks.rpc.mockResolvedValue({ data: [{ ...invitation, status }], error: null });
    render(<MemoryRouter initialEntries={['/accept-invite?token=test-token']}><AcceptInvite /></MemoryRouter>);
    await screen.findByRole('heading', { name: status === 'revoked' ? 'Invite revoked' : 'Invite expired' });
    expect(screen.queryByRole('button', { name: 'Activate account' })).toBeNull();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
  it('blocks a pending invitation whose expiry has passed', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...invitation, expires_at: '2000-01-01' }], error: null });
    render(<MemoryRouter initialEntries={['/accept-invite?token=test-token']}><AcceptInvite /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Invite expired' });
  });
  it('reports failed account switching and retains the invitation', async () => {
    mocks.auth.user = { id: 'wrong', email: 'other@example.com' };
    mocks.signOut.mockRejectedValue(new Error('Could not sign out. Please try again.'));
    await showInvite();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with invited email' }));
    await screen.findByRole('alert');
    expect(mocks.nav).not.toHaveBeenCalled();
    mocks.signOut.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with invited email' }));
    await waitFor(() => expect(mocks.nav).toHaveBeenCalledWith(expect.stringContaining('/login?next=')));
  });
  it('resumes after email confirmation in the same page without another signup', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const view = render(<MemoryRouter initialEntries={['/accept-invite?token=test-token']}><AcceptInvite /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Join Test shop' });
    signup(); await screen.findByRole('status');
    mocks.auth.user = { id: 'confirmed', email: 'EMPLOYEE@example.com' };
    view.rerender(<MemoryRouter initialEntries={['/accept-invite?token=test-token']}><AcceptInvite /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Join team' }));
    await waitFor(() => expect(mocks.nav).toHaveBeenCalledWith('/dashboard', { replace: true }));
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
  });
  it('can retry acceptance after a failed response', async () => {
    mocks.auth.user = { id: 'confirmed', email: invitation.email };
    let attempts = 0;
    mocks.rpc.mockImplementation((name: string) => Promise.resolve(name === 'get_invitation_by_token'
      ? { data: [invitation], error: null }
      : ++attempts === 1 ? { data: null, error: { message: 'Network failed' } } : { data: 'business', error: null }));
    await showInvite();
    fireEvent.click(screen.getByRole('button', { name: 'Join team' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Join team' }));
    await waitFor(() => expect(mocks.nav).toHaveBeenCalled());
    expect(attempts).toBe(2);
  });
});

it('opens the invited workspace from an already accepted link for the signed-in recipient', async () => {
  mocks.auth.user = { id: 'confirmed', email: invitation.email };
  mocks.rpc.mockImplementation((name: string) => Promise.resolve({ data: name === 'get_invitation_by_token' ? [{ ...invitation, status: 'accepted' }] : 'business', error: null }));
  render(<MemoryRouter initialEntries={['/accept-invite?token=test-token']}><AcceptInvite /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Open workspace' }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith('business'));
  expect(mocks.nav).toHaveBeenCalledWith('/dashboard', { replace: true });
});
