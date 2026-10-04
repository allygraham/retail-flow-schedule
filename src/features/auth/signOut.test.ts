import { beforeEach, expect, it, vi } from 'vitest';
import { signOutChecked, SignOutError } from './signOut';
const api = vi.hoisted(() => ({ signOut: vi.fn(), getSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: api } }));
beforeEach(() => vi.resetAllMocks());
it('accepts a successful sign-out without checking or restoring credentials', async () => {
  api.signOut.mockResolvedValue({ error: null });
  await signOutChecked(); expect(api.getSession).not.toHaveBeenCalled();
});
it('distinguishes local logout from failed remote session revocation', async () => {
  api.signOut.mockResolvedValue({ error: { message: 'Remote failed' } });
  api.getSession.mockResolvedValue({ data: { session: null }, error: null });
  await expect(signOutChecked()).rejects.toMatchObject({ localSignedOut: true, message: expect.stringContaining('signed out on this device') });
});
it.each([false, true])('reports failure when local session remains or cannot be checked (network=%s)', async network => {
  api.signOut.mockRejectedValue(new Error('Offline'));
  if (network) api.getSession.mockRejectedValue(new Error('Offline'));
  else api.getSession.mockResolvedValue({ data: { session: { user: { id: 'u' } } }, error: null });
  try { await signOutChecked(); expect.unreachable(); }
  catch (error) { expect(error).toBeInstanceOf(SignOutError); expect(error).toMatchObject({ localSignedOut: false }); }
});
