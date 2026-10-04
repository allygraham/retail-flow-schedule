import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthProvider';
import { ProtectedRoute } from './ProtectedRoute';
const mocks = vi.hoisted(() => ({
  session: { user: { id: 'self' } }, responses: {} as Record<string, any>, listener: null as any,
  getSession: vi.fn(), signOut: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: mocks.getSession, signOut: mocks.signOut,
    onAuthStateChange: (listener: any) => { mocks.listener = listener; return { data: { subscription: { unsubscribe: vi.fn() } } }; },
  },
  from: (table: string) => {
    const response = mocks.responses[table];
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: () => query,
      then: (resolve: any, reject: any) => Promise.resolve(response).then(resolve, reject) };
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
  ready(); mocks.getSession.mockReset(); mocks.signOut.mockReset();
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
    let resolveRoles!: (value: any) => void;
    mocks.responses.user_roles = new Promise(resolve => { resolveRoles = resolve; }); show();
    // Membership query completes before the role query starts.
    await waitFor(() => expect(screen.getByText('Loading Lavoro…')).toBeInTheDocument());
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
