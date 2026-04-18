import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import s from './Auth.module.scss';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password'
    });
    setLoading(false);
    if (error) setErr(error.message); else setSent(true);
  };

  return (
    <div className={s.page}>
      <div className={s.card}>
        <Logo />
        <h1 className={s.title}>Forgot password</h1>
        <p className={s.sub}>We'll email you a reset link.</p>
        {sent ? (
          <div className={s.ok}>If an account exists for {email}, a reset link is on its way.</div>
        ) : (
          <form onSubmit={onSubmit} className={s.form}>
            <Field label="Email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></Field>
            {err && <div className={s.err}>{err}</div>}
            <Button type="submit" full loading={loading}>Send reset link</Button>
          </form>
        )}
        <div className={s.foot}><Link to="/login">← Back to sign in</Link></div>
      </div>
    </div>
  );
}
