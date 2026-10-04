import { supabase } from '@/integrations/supabase/client';
export class SignOutError extends Error {
  constructor(readonly localSignedOut: boolean) {
    super(localSignedOut
      ? 'You are signed out on this device, but other sessions could not be signed out. Sign in again to retry.'
      : 'Could not sign out. Please try again.');
  }
}
/** The SDK can clear local auth while reporting a remote revocation failure. */
export async function signOutChecked() {
  try {
    const { error } = await supabase.auth.signOut();
    if (!error) return;
  } catch { /* Inspect local state before reporting a network failure. */ }
  let localSignedOut = false;
  try {
    const { data, error } = await supabase.auth.getSession();
    localSignedOut = !error && !data.session;
  } catch { /* Without a successful check, do not claim local logout succeeded. */ }
  throw new SignOutError(localSignedOut);
}
