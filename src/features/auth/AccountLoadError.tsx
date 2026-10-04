import { Button } from '@/components/common/Button';
import { useAuth } from './AuthProvider';
export function AccountLoadError() {
  const { error, refresh, signOut } = useAuth();
  return <div role="alert">
    <h1>Unable to load your account</h1><p>{error}</p>
    <Button onClick={() => { void refresh(); }}>Try again</Button>
    <Button variant="ghost" onClick={() => { void signOut(); }}>Sign out</Button>
  </div>;
}
