import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import { resetSchema } from '@/lib/validation';
import s from './Auth.module.scss';

export default function ResetPassword() {
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase will populate session from URL hash recovery token
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((evt) => {
      if (evt === 'PASSWORD_RECOVERY' || evt === 'SIGNED_IN') setReady(true);
    });
    return () => sub.subscription.unsubscribe();
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
    nav('/dashboard', { replace: true });
  };

  return (
    <div className={s.page}>
      <div className={s.card}>
        <Logo />
        <h1 className={s.title}>Set a new password</h1>
        {!ready && <p className={s.sub}>Open this page from the link in your email.</p>}
        <form onSubmit={onSubmit} className={s.form}>
          <Field label="New password"><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
          <Field label="Confirm password"><Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></Field>
          {err && <div className={s.err}>{err}</div>}
          <Button type="submit" full loading={loading} disabled={!ready}>Update password</Button>
        </form>
        <div className={s.foot}><Link to="/login">← Back to sign in</Link></div>
      </div>
    </div>
  );
}
