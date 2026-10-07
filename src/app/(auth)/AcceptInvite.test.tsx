import { act, render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
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

it('a consumed link cannot accept again even for its signed-in recipient', async () => {
  mocks.auth.user = { id: 'confirmed', email: invitation.email };
  mocks.rpc.mockResolvedValue({ data: [{ ...invitation, status: 'accepted' }], error: null });
  render(<MemoryRouter initialEntries={['/accept-invite?token=test-token']}><AcceptInvite /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Already accepted' });
  expect(screen.queryByRole('button', { name: 'Open workspace' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.signUp).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it('does not consume a code when account creation fails and allows retry', async () => {
  mocks.signUp.mockResolvedValueOnce({ data: {}, error: { message: 'Could not create account' } })
    .mockResolvedValueOnce({ data: { session: { user: { id: 'new', email: invitation.email } } }, error: null });
  await showInvite(); signup();
  await screen.findByText('Could not create account');
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  signup();
  await waitFor(() => expect(mocks.nav).toHaveBeenCalledWith('/dashboard', { replace: true }));
  expect(mocks.rpc).toHaveBeenCalledWith('accept_invitation', { _token: 'test-token' });
});


describe('invitation request recovery and duplicate actions', () => {
  it('handles a rejected invitation lookup without leaving the page loading', async () => {
    mocks.rpc.mockRejectedValue(new Error('Offline'));
    render(<MemoryRouter initialEntries={['/accept-invite?token=test-token']}><AcceptInvite /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Invite not found' });
    expect(screen.getByText('Could not load your invitation. Please try again.')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading invitation' })).not.toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
  it('does not query the server without an invitation token', async () => {
    render(<MemoryRouter initialEntries={['/accept-invite']}><AcceptInvite /></MemoryRouter>);
    await screen.findByText('Missing invite token');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('reports a missing invitation without offering account creation', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    render(<MemoryRouter initialEntries={['/accept-invite?token=test-token']}><AcceptInvite /></MemoryRouter>);
    await screen.findByText('Invite not found.');
    expect(screen.queryByRole('button', { name: 'Activate account' })).not.toBeInTheDocument();
  });
  it('guards two submissions in the same event before React disables the button', async () => {
    mocks.auth.user = { id: 'confirmed', email: invitation.email };
    let finish!: (value: { data: string; error: null }) => void;
    mocks.rpc.mockImplementation((name: string) => name === 'get_invitation_by_token'
      ? Promise.resolve({ data: [invitation], error: null })
      : new Promise(resolve => { finish = resolve; }));
    await showInvite();
    const form = screen.getByRole('button', { name: 'Join team' }).closest('form')!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'accept_invitation')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Join team' })).toBeDisabled();
    await act(async () => finish({ data: 'business', error: null }));
    expect(mocks.nav).toHaveBeenCalledTimes(1);
  });
  it.each(['acceptance', 'refresh'])('releases the join form after a rejected %s request and allows retry', async stage => {
    mocks.auth.user = { id: 'confirmed', email: invitation.email };
    if (stage === 'acceptance') {
      let failed = false;
      mocks.rpc.mockImplementation((name: string) => name === 'get_invitation_by_token'
        ? Promise.resolve({ data: [invitation], error: null })
        : !failed ? (failed = true, Promise.reject(new Error('Offline'))) : Promise.resolve({ data: 'business', error: null }));
    } else mocks.refresh.mockRejectedValueOnce(new Error('Offline'));
    await showInvite();
    fireEvent.click(screen.getByRole('button', { name: 'Join team' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Join team' })).toBeEnabled();
    expect(mocks.nav).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Join team' }));
    await waitFor(() => expect(mocks.nav).toHaveBeenCalledTimes(1));
  });
  it('handles unexpected signup failures without accepting anonymously and allows retry', async () => {
    mocks.signUp.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ data: { session: null }, error: null });
    await showInvite(); signup();
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Activate account' })).toBeEnabled();
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'accept_invitation')).toHaveLength(0);
    signup(); await screen.findByRole('status');
    expect(mocks.signUp).toHaveBeenCalledTimes(2);
  });
});
