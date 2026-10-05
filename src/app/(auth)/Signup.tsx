import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AccountLoadError } from '@/features/auth/AccountLoadError';
import { useAuth } from '@/features/auth/authContext';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import s from './Auth.module.scss';

export default function Signup() {
  const nav = useNavigate();
  const { user, business, loading: authLoading, error: accountError, refresh } = useAuth();
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);

  useEffect(() => {
    if (user?.user_metadata.business_name) setBusinessName(user.user_metadata.business_name);
  }, [user?.user_metadata.business_name]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErr(null);
    if (authLoading || accountError) return;
    if (user) {
      if (!businessName.trim()) { setErr('Enter your business name.'); return; }
      setLoading(true);
      try {
        const { error } = await supabase.rpc('bootstrap_business', { _name: businessName.trim(), _slug: businessName.trim() });
        if (error) { setErr(error.message); return; }
        await refresh();
        nav('/dashboard', { replace: true });
      } catch {
        setErr('Could not create your workspace. Please try again.');
      } finally { setLoading(false); }
      return;
    }
    setLoading(true);
    try {
      try {
        const { signupSchema } = await import('@/lib/validation');
        const parsed = signupSchema.safeParse({ fullName, businessName, email, password });
        if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
      } catch {
        setErr('Could not load form validation. Please try again.');
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName, role: 'owner', business_name: businessName }, emailRedirectTo: window.location.origin + '/dashboard' }
      });
      if (error) { setErr(error.message); return; }
      if (!data.session) {
        setConfirmationPending(true);
        setPassword('');
        return;
      }
      const { error: bErr } = await supabase.rpc('bootstrap_business', { _name: businessName, _slug: businessName });
      if (bErr) { setErr(bErr.message); return; }
      await refresh();
      nav('/dashboard', { replace: true });
    } catch {
      setErr('Could not create your workspace. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!authLoading && !accountError && user && business) return <Navigate to="/dashboard" replace />;

  return (
    <div className={s.page}>
      <div className={s.card}>
        <Logo />
        <h1 className={s.title}>{confirmationPending && !user ? 'Check your email' : user ? 'Finish creating your workspace' : 'Create your workspace'}</h1>
        {accountError && <AccountLoadError />}
        {confirmationPending && !user ? (
          <p className={s.sub} role="status">Check {email} for a confirmation link. Confirm your email, then sign in to finish creating your workspace.</p>
        ) : <>
        <p className={s.sub}>{user ? 'Enter your business name to complete setup.' : 'Start scheduling in under a minute.'}</p>
        <form onSubmit={onSubmit} className={s.form}>
          {!user && <Field label="Your name"><Input value={fullName} onChange={e => setFullName(e.target.value)} required /></Field>}
          <Field label="Business name"><Input value={businessName} onChange={e => setBusinessName(e.target.value)} required /></Field>
          {!user && <Field label="Work email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></Field>}
          {!user && <Field label="Password" hint="At least 8 characters"><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>}
          {err && <div className={s.err} role="alert">{err}</div>}
          <Button type="submit" full loading={loading} disabled={loading || authLoading || !!accountError}>Create workspace</Button>
        </form>
        </>}
        <div className={s.foot}>
          <span>Already have an account? <Link to="/login">Sign in</Link></span>
        </div>
      </div>
    </div>
  );
}
