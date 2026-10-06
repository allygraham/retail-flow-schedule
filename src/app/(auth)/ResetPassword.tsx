import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { signOutChecked, SignOutError } from '@/features/auth/signOut';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import s from './Auth.module.scss';

/**
 * /reset-password is the page Supabase redirects to from the password
 * reset email. The recovery token in the URL is exchanged for a session
 * automatically by the Supabase client; we listen for PASSWORD_RECOVERY
 * (and any active session) to enable the form.
 *
 * Supabase Auth → URL Configuration must include:
 *   - http://localhost:5173/reset-password
 *   - https://<your-app-domain>/reset-password
 */
export default function ResetPassword() {
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [verificationError, setVerificationError] = useState(false);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [done, setDone] = useState(false);
  const [localSignedOut, setLocalSignedOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let authEvent = 0;
    setChecked(false); setReady(false); setVerificationError(false);
    const linkError = new URLSearchParams(window.location.search).has('error')
      || new URLSearchParams(window.location.hash.slice(1)).has('error');
    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (!mounted || linkError) return;
      if ((evt === 'PASSWORD_RECOVERY' || evt === 'SIGNED_IN') && session) {
        authEvent++;
        setReady(true); setChecked(true); setVerificationError(false);
      }
      if (evt === 'SIGNED_OUT') {
        authEvent++;
        setReady(false); setChecked(true); setVerificationError(false);
      }
    });
    const initialEvent = authEvent;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || initialEvent !== authEvent) return;
      if (error && !linkError) setVerificationError(true);
      if (!linkError && !error && data.session) setReady(true);
      setChecked(true);
    }).catch(() => { if (mounted && initialEvent === authEvent) { if (!linkError) setVerificationError(true); setChecked(true); } });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [verificationAttempt]);

  const finish = async () => {
    setLoading(true); setLogoutError(null);
    try {
      await signOutChecked();
      nav('/login', { replace: true });
    } catch (error) {
      const local = error instanceof SignOutError && error.localSignedOut;
      setLocalSignedOut(local);
      setLogoutError(local
        ? 'Your password was updated. You are signed out on this device, but other sessions could not be signed out.'
        : 'Your password was updated, but we could not sign you out. Please try again.');
    } finally { setLoading(false); }
  };
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || loading) return;
    setErr(null);
    setLoading(true);
    try {
      const { resetSchema } = await import('@/lib/validation');
      const parsed = resetSchema.safeParse({ password, confirm });
      if (!parsed.success) { setLoading(false); setErr(parsed.error.issues[0].message); return; }
    } catch {
      setErr('Could not load form validation. Please try again.');
      setLoading(false);
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { setErr(error.message); return; }
      setDone(true);
      await finish();
    } catch {
      setErr('Could not update your password. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className={s.page}>
      <div className={s.card}>
        <Logo />
        <h1 className={s.title}>Set a new password</h1>

        {done ? (
          <>
            <div className={s.ok}>Password updated.</div>
            {logoutError && <div role="alert" className={s.err}>{logoutError}</div>}
            {localSignedOut ? <Link to="/login">Continue to sign in</Link> : <Button full loading={loading} onClick={() => { void finish(); }}>Sign out and continue</Button>}
          </>
        ) : verificationError ? (
          <div role="alert">
            <p className={s.err}>Could not verify your reset link. Please try again.</p>
            <Button onClick={() => setVerificationAttempt(attempt => attempt + 1)}>Try again</Button>
          </div>
        ) : !ready && checked ? (
          <>
            <p className={s.sub}>
              This reset link is invalid or has expired. Please request a new one.
            </p>
            <div className={s.foot}>
              <Link to="/forgot-password">← Request a new link</Link>
            </div>
          </>
        ) : (
          <>
            {!ready && <LoadingSkeleton layout="inline" label="Verifying reset link" />}
            <form onSubmit={onSubmit} className={s.form}>
              <Field label="New password" hint="At least 8 characters">
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={!ready || loading}
                />
              </Field>
              <Field label="Confirm password">
                <Input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={!ready || loading}
                />
              </Field>
              {err && <div className={s.err} role="alert">{err}</div>}
              <Button type="submit" full loading={loading} disabled={!ready || loading}>
                Update password
              </Button>
            </form>
            <div className={s.foot}><Link to="/login">← Back to sign in</Link></div>
          </>
        )}
      </div>
    </div>
  );
}
