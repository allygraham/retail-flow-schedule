import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { useAuth } from './AuthProvider';
export function AccountLoadError() {
  const { error, refresh, signOut } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  return <div role="alert">
    <h1>Unable to load your account</h1><p>{error}</p>
    <Button onClick={() => { void refresh(); }}>Try again</Button>
    {logoutError && <p role="alert">{logoutError}</p>}
    <Button variant="ghost" onClick={() => { setLogoutError(null); void signOut().catch(() => setLogoutError('Could not sign out. Please try again.')); }}>Sign out</Button>
  </div>;
}
