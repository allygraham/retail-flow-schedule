import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import { loginSchema } from '@/lib/validation';
import s from './Auth.module.scss';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('owner@lavoro.demo');
  const [password, setPassword] = useState('LavoroDemo123!');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    nav('/dashboard', { replace: true });
  };

  return (
    <div className={s.page}>
      <div className={s.card}>
        <Logo /> 
        <h1 className={s.title}>Welcome back</h1>
        <p className={s.sub}>Sign in to manage your rotas.</p>
        <form onSubmit={onSubmit} className={s.form}>
          <Field label="Email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></Field>
          <Field label="Password"><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
          {err && <div className={s.err}>{err}</div>}
          <Button type="submit" full loading={loading}>Sign in</Button>
        </form>
        <div className={s.foot}>
          <Link to="/forgot">Forgot password?</Link>
          <span>New here? <Link to="/signup">Create an account</Link></span>
        </div>
        <div className={s.demo}>
          <strong>Demo accounts</strong> (password <code>LavoroDemo123!</code>):<br/>
          <button type="button" onClick={() => { setEmail('owner@lavoro.demo'); }}>owner@lavoro.demo</button>
          <button type="button" onClick={() => { setEmail('manager@lavoro.demo'); }}>manager@lavoro.demo</button>
          <button type="button" onClick={() => { setEmail('employee@lavoro.demo'); }}>employee@lavoro.demo</button>
        </div>
      </div>
    </div>
  );
}
