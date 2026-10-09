import { useState } from 'react';
import type { MockResponse, MockResult } from '@/test/types';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './authContext';
import { ProtectedRoute } from './ProtectedRoute';
const mocks = vi.hoisted(() => ({
  session: { user: { id: 'self' } }, responses: {} as Record<string, MockResult>, listener: (() => {}) as (event: string, session: unknown) => void,
  getSession: vi.fn(), signOut: vi.fn(), queries: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: mocks.getSession, signOut: mocks.signOut,
    onAuthStateChange: (listener: typeof mocks.listener) => { mocks.listener = listener; return { data: { subscription: { unsubscribe: vi.fn() } } }; },
  },
  from: (table: string) => {
    mocks.queries(table);
    const response = mocks.responses[table];
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: () => query,
      then: Promise.resolve(response).then.bind(Promise.resolve(response)) };
    return query;
  },
} }));
function Account() {
  const { business, role, signOut } = useAuth();
  return <div>Workspace: {business?.name} / {role}<button onClick={() => void signOut()}>Log out</button></div>;
}
const show = () => render(<MemoryRouter initialEntries={['/dashboard']}><AuthProvider><Routes>
  <Route path="/dashboard" element={<ProtectedRoute><Account /></ProtectedRoute>} />
  <Route path="/signup" element={<div>Workspace signup</div>} />
  <Route path="/login" element={<div>Login screen</div>} />
</Routes></AuthProvider></MemoryRouter>);
const ready = () => {
  mocks.responses = {
    profiles: { data: { full_name: 'Ally' }, error: null },
    memberships: { data: { businesses: { id: 'shop', name: 'Shop' } }, error: null },
    user_roles: { data: [{ role: 'owner' }], error: null },
  };
};
beforeEach(() => {
  ready(); mocks.queries.mockClear(); mocks.getSession.mockReset(); mocks.signOut.mockReset();
  mocks.getSession.mockResolvedValue({ data: { session: mocks.session }, error: null });
  mocks.signOut.mockImplementation(async () => { mocks.listener('SIGNED_OUT', null); return { error: null }; });
});
afterEach(cleanup);
describe('account loading and protected routing', () => {
  it.each(['profiles', 'memberships', 'user_roles'])('shows retry for a %s error instead of workspace signup', async (table) => {
    mocks.responses[table] = { data: null, error: { message: 'Database unavailable' } }; show();
    await screen.findByRole('alert'); expect(screen.queryByText('Workspace signup')).not.toBeInTheDocument();
    expect(screen.queryByText(/Workspace: Shop/)).not.toBeInTheDocument();
    ready(); fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Workspace: Shop / owner'); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('handles rejected network requests without redirecting to signup', async () => {
    // Attach a handler before the deferred query consumes it.
    const failure = Promise.reject(new Error('Offline')); failure.catch(() => {});
    mocks.responses.memberships = failure; show(); await screen.findByRole('alert');
    expect(screen.queryByText('Workspace signup')).not.toBeInTheDocument();
  });
  it('shows retry for session loading errors before redirecting to login', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'Offline' } }); show();
    await screen.findByRole('alert'); expect(screen.queryByText('Login screen')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' })); await screen.findByText('Login screen');
  });
  it('uses signup only after a successful lookup confirms no active workspace', async () => {
    mocks.responses.memberships = { data: null, error: null }; show(); await screen.findByText('Workspace signup');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('treats missing role or inaccessible workspace as loading errors', async () => {
    mocks.responses.user_roles = { data: [], error: null }; show(); await screen.findByRole('alert');
    ready(); mocks.responses.memberships = { data: { businesses: null }, error: null };
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText('Workspace signup')).not.toBeInTheDocument();
  });
  it('ignores a late account response after logout', async () => {
    let resolveRoles!: (value: MockResponse) => void;
    mocks.responses.user_roles = new Promise(resolve => { resolveRoles = resolve; }); show();
    // Membership query completes before the role query starts.
    await waitFor(() => expect(screen.getByRole('status', { name: 'Loading account' })).toBeInTheDocument());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); mocks.listener('SIGNED_OUT', null); });
    await screen.findByText('Login screen');
    await act(async () => resolveRoles({ data: [{ role: 'owner' }], error: null }));
    expect(screen.getByText('Login screen')).toBeInTheDocument(); expect(screen.queryByText(/Workspace: Shop/)).not.toBeInTheDocument();
  });
  it('reports a failed sign-out and permits retry without pretending it succeeded', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'Offline' } });
    mocks.signOut.mockResolvedValue({ error: { message: 'Sign-out failed' } }); show();
    await screen.findByRole('button', { name: 'Sign out' }); fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByText('Could not sign out. Please try again.');
    expect(screen.queryByText('Login screen')).not.toBeInTheDocument();
    mocks.signOut.mockImplementation(async () => { mocks.listener('SIGNED_OUT', null); return { error: null }; });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' })); await screen.findByText('Login screen');
  });

});


describe('account role and session race regressions', () => {
  it.each([
    { roles: ['employee', 'manager', 'owner'], expected: 'owner' },
    { roles: ['owner', 'employee', 'manager'], expected: 'owner' },
    { roles: ['employee', 'manager'], expected: 'manager' },
    { roles: ['admin', 'manager', 'employee'], expected: 'admin' },
    { roles: ['admin', 'owner'], expected: 'owner' },
    { roles: ['employee'], expected: 'employee' },
  ])('uses $expected access for role rows $roles', async ({ roles, expected }) => {
    mocks.responses.user_roles = { data: roles.map(role => ({ role })), error: null };
    show();
    await screen.findByText(`Workspace: Shop / ${expected}`);
  });
  it('does not accept unrecognised server roles as management access', async () => {
    mocks.responses.user_roles = { data: [{ role: 'administrator' }], error: null };
    show(); await screen.findByRole('alert');
    expect(screen.queryByText(/Workspace: Shop/)).not.toBeInTheDocument();
  });
  it('ignores old owner role responses after another user signs in', async () => {
    let completeOldRoles!: (value: MockResponse) => void;
    mocks.responses.user_roles = new Promise(resolve => { completeOldRoles = resolve; });
    show();
    await waitFor(() => expect(mocks.queries).toHaveBeenCalledWith('user_roles'));
    mocks.responses.memberships = { data: { businesses: { id: 'second-shop', name: 'Second Shop' } }, error: null };
    mocks.responses.user_roles = { data: [{ role: 'employee' }], error: null };
    await act(async () => mocks.listener('SIGNED_IN', { user: { id: 'second-user' } }));
    await screen.findByText('Workspace: Second Shop / employee');
    await act(async () => completeOldRoles({ data: [{ role: 'owner' }], error: null }));
    expect(screen.getByText('Workspace: Second Shop / employee')).toBeInTheDocument();
    expect(screen.queryByText('Workspace: Shop / owner')).not.toBeInTheDocument();
  });
  it('ignores an initial session lookup that finishes after a sign-out event', async () => {
    let complete!: (value: { data: { session: typeof mocks.session }; error: null }) => void;
    mocks.getSession.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    show();
    await act(async () => mocks.listener('SIGNED_OUT', null));
    await screen.findByText('Login screen');
    await act(async () => complete({ data: { session: mocks.session }, error: null }));
    expect(screen.getByText('Login screen')).toBeInTheDocument();
    expect(mocks.queries).not.toHaveBeenCalled();
  });
});


describe('background authentication refresh', () => {
  function Draft() {
    const [value, setValue] = useState('');
    const { role } = useAuth();
    return <><input aria-label="Draft" value={value} onChange={event => setValue(event.target.value)} /><span>Access: {role}</span></>;
  }
  const showDraft = () => render(<MemoryRouter><AuthProvider><ProtectedRoute><Draft /></ProtectedRoute></AuthProvider></MemoryRouter>);
  it.each(['TOKEN_REFRESHED', 'SIGNED_IN', 'USER_UPDATED'])('preserves an open draft on same-user %s', async event => {
    showDraft(); const input = await screen.findByRole('textbox', { name: 'Draft' });
    fireEvent.change(input, { target: { value: 'Unsaved changes' } });
    await act(async () => mocks.listener(event, { user: { id: 'self' } }));
    await waitFor(() => expect(mocks.queries.mock.calls.filter(call => call[0] === 'user_roles')).toHaveLength(2));
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    expect(input).toHaveValue('Unsaved changes');
  });
  it('keeps the draft during a failed background account check', async () => {
    showDraft(); const input = await screen.findByRole('textbox', { name: 'Draft' });
    fireEvent.change(input, { target: { value: 'Unsaved changes' } });
    mocks.responses.memberships = { data: null, error: { message: 'Offline' } };
    await act(async () => mocks.listener('TOKEN_REFRESHED', mocks.session));
    await waitFor(() => expect(mocks.queries.mock.calls.filter(call => call[0] === 'memberships')).toHaveLength(2));
    expect(input).toHaveValue('Unsaved changes'); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('refreshes changed permissions without discarding a draft', async () => {
    showDraft(); const input = await screen.findByRole('textbox', { name: 'Draft' });
    fireEvent.change(input, { target: { value: 'Unsaved changes' } });
    mocks.responses.user_roles = { data: [{ role: 'employee' }], error: null };
    await act(async () => mocks.listener('TOKEN_REFRESHED', mocks.session));
    await screen.findByText('Access: employee'); expect(input).toHaveValue('Unsaved changes');
  });
  it('removes protected content when background checks confirm deactivation', async () => {
    showDraft(); await screen.findByRole('textbox', { name: 'Draft' });
    mocks.responses.memberships = { data: null, error: null };
    await act(async () => mocks.listener('TOKEN_REFRESHED', mocks.session));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Draft' })).not.toBeInTheDocument());
  });
  it('removes protected content when background checks confirm missing roles', async () => {
    showDraft(); await screen.findByRole('textbox', { name: 'Draft' });
    mocks.responses.user_roles = { data: [], error: null };
    await act(async () => mocks.listener('TOKEN_REFRESHED', mocks.session));
    await screen.findByRole('alert');
    expect(screen.queryByRole('textbox', { name: 'Draft' })).not.toBeInTheDocument();
  });
  it('cannot restore access from a late background response after logout', async () => {
    showDraft(); await screen.findByRole('textbox', { name: 'Draft' });
    let finish!: (value: MockResponse) => void;
    mocks.responses.memberships = new Promise(resolve => { finish = resolve; });
    await act(async () => mocks.listener('TOKEN_REFRESHED', mocks.session));
    await waitFor(() => expect(mocks.queries.mock.calls.filter(call => call[0] === 'memberships')).toHaveLength(2));
    await act(async () => mocks.listener('SIGNED_OUT', null));
    await act(async () => finish({ data: { businesses: { id: 'shop', name: 'Shop' } }, error: null }));
    expect(screen.queryByRole('textbox', { name: 'Draft' })).not.toBeInTheDocument();
    expect(screen.queryByText('Access: owner')).not.toBeInTheDocument();
  });

});
