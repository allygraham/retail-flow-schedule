import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { hasPermission } from './permissions';
import type { AppRole } from '@/types/domain';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), protectedRender: vi.fn() }));
vi.mock('./authContext', () => ({ useAuth: mocks.auth }));
function SensitiveContent() { mocks.protectedRender(); return <div>Protected content</div>; }
const account = (role: AppRole | null = 'employee') => ({ loading: false, error: null as string | null, user: { id: 'self' } as { id: string } | null, business: { id: 'shop' } as { id: string } | null, role, refresh: vi.fn(), signOut: vi.fn(), hasPermission: (permission: string) => hasPermission(role, permission) });
function show(props: Omit<React.ComponentProps<typeof ProtectedRoute>, 'children'> = {}) {
  return render(<MemoryRouter initialEntries={['/private']}><Routes>
    <Route path="/private" element={<ProtectedRoute {...props}><SensitiveContent /></ProtectedRoute>} />
    <Route path="/login" element={<div>Login destination</div>} />
    <Route path="/signup" element={<div>Signup destination</div>} />
    <Route path="/dashboard" element={<div>Dashboard destination</div>} />
  </Routes></MemoryRouter>);
}
beforeEach(() => { mocks.auth.mockReturnValue(account()); mocks.protectedRender.mockClear(); });
afterEach(cleanup);
it('never renders protected children while account loading is incomplete', () => {
  mocks.auth.mockReturnValue({ ...account('owner'), loading: true }); show({ permission: 'manage_settings' });
  expect(screen.getByRole('status', { name: 'Loading account' })).toBeInTheDocument();
  expect(mocks.protectedRender).not.toHaveBeenCalled();
});
it('shows account failures without rendering protected children or redirecting to signup', () => {
  mocks.auth.mockReturnValue({ ...account(), user: null, business: null, error: 'Account lookup failed' }); show();
  expect(screen.getByRole('alert')).toHaveTextContent('Account lookup failed');
  expect(screen.queryByText('Signup destination')).not.toBeInTheDocument();
  expect(screen.queryByText('Login destination')).not.toBeInTheDocument();
  expect(mocks.protectedRender).not.toHaveBeenCalled();
});
it.each(['signed-out', 'no-workspace'])('redirects %s accounts before rendering protected children', state => {
  mocks.auth.mockReturnValue({ ...account(), ...(state === 'signed-out' ? { user: null } : { business: null }) }); show();
  expect(screen.getByText(state === 'signed-out' ? 'Login destination' : 'Signup destination')).toBeInTheDocument();
  expect(mocks.protectedRender).not.toHaveBeenCalled();
});
it.each(['employee', 'manager'] as const)('keeps %s out of owner settings', role => {
  mocks.auth.mockReturnValue(account(role)); show({ permission: 'manage_settings' });
  expect(screen.getByText('Dashboard destination')).toBeInTheDocument();
  expect(mocks.protectedRender).not.toHaveBeenCalled();
});
it('requires both the explicit role restriction and the permission', () => {
  mocks.auth.mockReturnValue(account('manager')); show({ roles: ['owner'], permission: 'manage_staff', fallback: 'denied' });
  expect(screen.getByText('Access denied')).toBeInTheDocument();
  expect(mocks.protectedRender).not.toHaveBeenCalled();
});
it('does not treat an absent role as permission to enter a role-restricted area', () => {
  mocks.auth.mockReturnValue(account(null)); show({ roles: ['owner'], fallback: 'denied' });
  expect(screen.getByText('Access denied')).toBeInTheDocument();
  expect(mocks.protectedRender).not.toHaveBeenCalled();
});
it('allows authorised management content', () => {
  mocks.auth.mockReturnValue(account('manager')); show({ roles: ['owner', 'manager'], permission: 'manage_staff' });
  expect(screen.getByText('Protected content')).toBeInTheDocument();
});
