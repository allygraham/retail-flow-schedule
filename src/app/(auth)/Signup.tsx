import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import { signupSchema } from '@/lib/validation';
import s from './Auth.module.scss';

export default function Signup() {
  const nav = useNavigate();
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const parsed = signupSchema.safeParse({ fullName, businessName, email, password });
    if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin + '/dashboard' }
    });
    if (error) { setErr(error.message); setLoading(false); return; }
    if (!data.session) {
      // sign in (in case email confirmation off)
      await supabase.auth.signInWithPassword({ email, password });
    }
    const { error: bErr } = await supabase.rpc('bootstrap_business', { _name: businessName, _slug: businessName });
    setLoading(false);
    if (bErr) { setErr(bErr.message); return; }
    nav('/dashboard', { replace: true });
  };

  return (
    <div className={s.page}>
      <div className={s.card}>
        <Logo />
        <h1 className={s.title}>Create your workspace</h1>
        <p className={s.sub}>Start scheduling in under a minute.</p>
        <form onSubmit={onSubmit} className={s.form}>
          <Field label="Your name"><Input value={fullName} onChange={e => setFullName(e.target.value)} required /></Field>
          <Field label="Business name"><Input value={businessName} onChange={e => setBusinessName(e.target.value)} required /></Field>
          <Field label="Work email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></Field>
          <Field label="Password" hint="At least 8 characters"><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
          {err && <div className={s.err}>{err}</div>}
          <Button type="submit" full loading={loading}>Create workspace</Button>
        </form>
        <div className={s.foot}>
          <span>Already have an account? <Link to="/login">Sign in</Link></span>
        </div>
      </div>
    </div>
  );
}
