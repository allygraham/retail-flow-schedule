import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import { resetSchema } from '@/lib/validation';
import s from './Auth.module.scss';

/**
 * /reset-password is the page Supabase redirects to from the password
 * reset email. The recovery token in the URL is exchanged for a session
 * automatically by the Supabase client; we listen for PASSWORD_RECOVERY
 * (and any active session) to enable the form.
 *
 * Supabase Auth → URL Configuration must include:
 *   - http://localhost:5173/reset-password
 *   - https://<your-netlify-domain>/reset-password
 */
export default function ResetPassword() {
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Listen first so we don't miss the PASSWORD_RECOVERY event.
    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (!mounted) return;
      if (evt === 'PASSWORD_RECOVERY' || (evt === 'SIGNED_IN' && session)) {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) setReady(true);
      setChecked(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const parsed = resetSchema.safeParse({ password, confirm });
    if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setDone(true);
    // Sign out so the user logs in fresh with the new password.
    await supabase.auth.signOut();
    setTimeout(() => nav('/login', { replace: true }), 1500);
  };

  return (
    <div className={s.page}>
      <div className={s.card}>
        <Logo />
        <h1 className={s.title}>Set a new password</h1>

        {done ? (
          <div className={s.ok}>
            Password updated. Redirecting you to sign in…
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
            {!ready && <p className={s.sub}>Verifying your reset link…</p>}
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
              {err && <div className={s.err}>{err}</div>}
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
