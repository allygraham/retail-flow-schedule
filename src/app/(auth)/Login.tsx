import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import s from './Auth.module.scss';

export default function Login() {
  const nav = useNavigate();
  const { signOutNotice } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next');
  const destination = next?.startsWith('/accept-invite?') ? next : '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErr(null);
    setLoading(true);
    try {
      const { loginSchema } = await import('@/lib/validation');
      const parsed = loginSchema.safeParse({ email, password });
      if (!parsed.success) { setLoading(false); setErr(parsed.error.issues[0].message); return; }
    } catch {
      setErr('Could not load form validation. Please try again.');
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    nav(destination, { replace: true });
  };

  return (
    <div className={s.page}>
      <div className={s.card}>
        <Logo /> 
        <h1 className={s.title}>Welcome back</h1>
        <p className={s.sub}>Sign in to manage your rotas.</p>
        {signOutNotice && <div className={s.err} role="alert">{signOutNotice}</div>}
        <form onSubmit={onSubmit} className={s.form}>
          <Field label="Email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></Field>
          <Field label="Password"><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
          {err && <div className={s.err}>{err}</div>}
          <Button type="submit" full loading={loading}>Sign in</Button>
        </form>
        <div className={s.foot}>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
      </div>
    </div>
  );
}
