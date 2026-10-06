import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
const api = vi.hoisted(() => ({ reset: vi.fn(), session: vi.fn(), update: vi.fn(), logout: vi.fn(), nav: vi.fn(), listener: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  resetPasswordForEmail: api.reset, getSession: api.session, updateUser: api.update, signOut: api.logout,
  onAuthStateChange: (listener: typeof api.listener) => { api.listener = listener; return { data: { subscription: { unsubscribe: api.unsubscribe } } }; },
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


it.each([400, 404])('does not expose account existence from a %i reset response', async status => {
  api.reset.mockResolvedValue({ error: { status, message: 'This account does not exist' } }); forgot();
  await screen.findByText(/If an account exists/);
  expect(screen.queryByText('This account does not exist')).not.toBeInTheDocument();
});
it.each(['short', 'mismatched'])('rejects %s passwords before any update or logout', async kind => {
  render(<MemoryRouter><ResetPassword /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled());
  const inputs = document.querySelectorAll('input');
  fireEvent.change(inputs[0], { target: { value: kind === 'short' ? 'short' : 'NewPassword123!' } });
  fireEvent.change(inputs[1], { target: { value: kind === 'short' ? 'short' : 'DifferentPassword123!' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Update password' }).closest('form')!);
  const error = await screen.findByRole('alert');
  expect(error).toHaveTextContent(kind === 'short' ? /8/ : 'Passwords do not match');
  expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled();
  expect(api.update).not.toHaveBeenCalled(); expect(api.logout).not.toHaveBeenCalled(); expect(api.nav).not.toHaveBeenCalled();
});
it('keeps a signed-out reset session disabled when the initial session lookup finishes late', async () => {
  let complete!: (value: { data: { session: { user: { id: string } } }; error: null }) => void;
  api.session.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  render(<MemoryRouter><ResetPassword /></MemoryRouter>);
  await act(async () => api.listener('SIGNED_OUT', null));
  await act(async () => complete({ data: { session: { user: { id: 'old' } } }, error: null }));
  expect(screen.queryByRole('button', { name: 'Update password' })).not.toBeInTheDocument();
  expect(screen.getByText(/invalid or has expired/)).toBeInTheDocument();
  expect(api.update).not.toHaveBeenCalled();
});
it.each(['reported', 'rejected'])('preserves a valid recovery event when the earlier lookup fails (%s)', async kind => {
  let complete!: (value: { data: { session: null }; error: { message: string } }) => void;
  let fail!: (error: Error) => void;
  api.session.mockImplementationOnce(() => new Promise((resolve, reject) => { complete = resolve; fail = reject; }));
  render(<MemoryRouter><ResetPassword /></MemoryRouter>);
  await act(async () => api.listener('PASSWORD_RECOVERY', { user: { id: 'new' } }));
  await act(async () => { if (kind === 'reported') complete({ data: { session: null }, error: { message: 'Old lookup failed' } }); else fail(new Error('Old lookup failed')); });
  expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it.each(['query', 'hash'])('never enables recovery when the URL contains an error in its %s', async location => {
  window.history.replaceState({}, '', `/reset-password${location === 'query' ? '?' : '#'}error=access_denied&error_code=otp_expired`);
  render(<MemoryRouter><ResetPassword /></MemoryRouter>);
  await act(async () => api.listener('PASSWORD_RECOVERY', { user: { id: 'u' } }));
  await screen.findByText(/invalid or has expired/);
  expect(screen.queryByRole('button', { name: 'Update password' })).not.toBeInTheDocument();
});
it('retains an explicitly expired-link message even if checking the session rejects', async () => {
  window.history.replaceState({}, '', '/reset-password#error=access_denied');
  api.session.mockRejectedValue(new Error('Offline'));
  render(<MemoryRouter><ResetPassword /></MemoryRouter>);
  await screen.findByText(/invalid or has expired/);
  expect(screen.queryByText('Could not verify your reset link. Please try again.')).not.toBeInTheDocument();
});
it.each(['reported', 'rejected'])('reports partial logout after updating the password (%s) without updating twice', async kind => {
  api.session.mockResolvedValueOnce({ data: { session: { user: { id: 'u' } } }, error: null }).mockResolvedValue({ data: { session: null }, error: null });
  if (kind === 'reported') api.logout.mockResolvedValue({ error: { message: 'Remote logout failed' } });
  else api.logout.mockRejectedValue(new Error('Remote logout failed'));
  await reset();
  await screen.findByRole('link', { name: 'Continue to sign in' });
  expect(screen.getByRole('alert')).toHaveTextContent('signed out on this device');
  expect(api.update).toHaveBeenCalledTimes(1); expect(api.nav).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Update password' })).not.toBeInTheDocument();
});
it('unsubscribes the recovery listener when the page is left', () => {
  const view = render(<MemoryRouter><ResetPassword /></MemoryRouter>);
  view.unmount(); expect(api.unsubscribe).toHaveBeenCalledTimes(1);
});
