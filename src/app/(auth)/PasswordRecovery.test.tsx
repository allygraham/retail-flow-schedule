import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
const api = vi.hoisted(() => ({ reset: vi.fn(), session: vi.fn(), update: vi.fn(), logout: vi.fn(), nav: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  resetPasswordForEmail: api.reset, getSession: api.session, updateUser: api.update, signOut: api.logout,
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
} } }));
vi.mock('@/features/auth/authContext', () => ({ useOptionalAuth: () => undefined }));
vi.mock('react-router-dom', async () => ({ ...await vi.importActual('react-router-dom'), useNavigate: () => api.nav }));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks(); window.history.replaceState({}, '', '/reset-password');
  api.reset.mockResolvedValue({ error: null }); api.session.mockResolvedValue({ data: { session: { user: { id: 'u' } } }, error: null });
  api.update.mockResolvedValue({ error: null }); api.logout.mockResolvedValue({ error: null });
});
function forgot() { render(<MemoryRouter><ForgotPassword /></MemoryRouter>); fireEvent.change(screen.getByRole('textbox'), { target: { value: 'person@example.test' } }); fireEvent.click(screen.getByRole('button', { name: 'Send reset link' })); }
async function reset() {
  render(<MemoryRouter><ResetPassword /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled());
  document.querySelectorAll('input').forEach(input => fireEvent.change(input, { target: { value: 'NewPassword123!' } }));
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
}
it('uses a generic reset response and the current origin', async () => {
  forgot(); await screen.findByText(/If an account exists/);
  expect(api.reset).toHaveBeenCalledWith('person@example.test', { redirectTo: `${window.location.origin}/reset-password` });
});
it.each([500, 429])('reports reset request error %i and allows retry', async status => {
  api.reset.mockResolvedValue({ error: { status } }); forgot();
  await screen.findByText(status === 429 ? /Too many requests/ : /Something went wrong/);
  expect(screen.getByRole('button', { name: 'Send reset link' })).toBeEnabled();
  expect(screen.queryByText(/If an account exists/)).not.toBeInTheDocument();
});
it('handles rejected reset requests', async () => { api.reset.mockRejectedValue(new Error('Offline')); forgot(); await screen.findByText(/Could not send/); });
it.each(['no-session', 'expired-link'])('rejects %s without enabling password updates', async kind => {
  if (kind === 'no-session') api.session.mockResolvedValue({ data: { session: null }, error: null });
  if (kind === 'expired-link') window.history.replaceState({}, '', '/reset-password#error=access_denied&error_code=otp_expired');
  render(<MemoryRouter><ResetPassword /></MemoryRouter>);
  await screen.findByText(/invalid or has expired/);
  expect(screen.queryByRole('button', { name: 'Update password' })).not.toBeInTheDocument();
  expect(api.update).not.toHaveBeenCalled();
});
it.each([false, true])('failed password update retains the form (network=%s)', async network => {
  if (network) api.update.mockRejectedValue(new Error('Offline'));
  else api.update.mockResolvedValue({ error: { message: 'Password update denied' } });
  await reset(); await screen.findByText(network ? /Could not update/ : /Password update denied/);
  expect(api.logout).not.toHaveBeenCalled(); expect(api.nav).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled();
});
it('reports logout failure after a saved password and retries logout only', async () => {
  api.logout.mockResolvedValue({ error: { message: 'Offline' } }); await reset();
  await screen.findByRole('alert'); expect(api.nav).not.toHaveBeenCalled();
  api.logout.mockResolvedValue({ error: null }); fireEvent.click(screen.getByRole('button', { name: 'Sign out and continue' }));
  await waitFor(() => expect(api.nav).toHaveBeenCalledWith('/login', { replace: true }));
  expect(api.update).toHaveBeenCalledTimes(1);
});
it('successful recovery signs out and returns to login', async () => { await reset(); await waitFor(() => expect(api.nav).toHaveBeenCalledWith('/login', { replace: true })); expect(api.logout).toHaveBeenCalledTimes(1); });

it('session verification failures show retry rather than claiming the link expired', async () => {
  api.session.mockRejectedValue(new Error('Offline'));
  render(<MemoryRouter><ResetPassword /></MemoryRouter>);
  await screen.findByRole('alert');
  expect(screen.queryByText(/invalid or has expired/)).not.toBeInTheDocument();
  api.session.mockResolvedValue({ data: { session: { user: { id: 'u' } } }, error: null });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled());
});
