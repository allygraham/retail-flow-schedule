import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import { acceptInviteSchema } from '@/lib/validation';
import s from './Auth.module.scss';

interface InviteRow {
  id: string;
  business_id: string;
  business_name: string;
  email: string;
  full_name: string | null;
  role: 'owner' | 'manager' | 'employee';
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
}

export default function AcceptInvite() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [lookupDone, setLookupDone] = useState(false);

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setLookupErr('Missing invite token'); setLookupDone(true); return; }
      const { data, error } = await supabase.rpc('get_invitation_by_token', { _token: token });
      if (cancelled) return;
      if (error) { setLookupErr(error.message); setLookupDone(true); return; }
      const row = (data as any[])?.[0] as InviteRow | undefined;
      if (!row) { setLookupErr('Invite not found.'); setLookupDone(true); return; }
      setInvite(row);
      setFullName(row.full_name ?? '');
      setLookupDone(true);
    })();
    return () => { cancelled = true; };
  }, [token]);

  const expired = invite && (invite.status === 'expired' || new Date(invite.expires_at) < new Date());
  const usable = invite && invite.status === 'pending' && !expired;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!invite) return;
    const parsed = acceptInviteSchema.safeParse({ full_name: fullName, password });
    if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }

    setLoading(true);
    // 1) Sign up (or sign in if account already exists with this email)
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: {
        data: { full_name: parsed.data.full_name, role: 'employee' },
        emailRedirectTo: `${window.location.origin}/accept-invite?token=${token}`,
      },
    });

    let session = signUpData?.session ?? null;
    if (signUpErr || !session) {
      // Try sign-in (e.g. account already exists or confirmations off but no session)
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: invite.email,
        password,
      });
      if (signInErr || !signInData.session) {
        setErr(signInErr?.message ?? signUpErr?.message ?? 'Could not sign you in. Check your password.');
        setLoading(false);
        return;
      }
      session = signInData.session;
    }

    // 2) Accept the invite — links auth user to business + creates membership/role/profile.
    const { error: acceptErr } = await supabase.rpc('accept_invitation', { _token: token });
    setLoading(false);
    if (acceptErr) { setErr(acceptErr.message); return; }
    nav('/dashboard', { replace: true });
  };

  if (!lookupDone) {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <Logo />
          <p className={s.sub}>Loading your invite…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <Logo />
        {!invite || lookupErr ? (
          <>
            <h1 className={s.title}>Invite not found</h1>
            <p className={s.sub}>{lookupErr ?? 'This invite link is no longer valid.'}</p>
            <div className={s.foot}><Link to="/login">Go to sign in</Link></div>
          </>
        ) : invite.status === 'accepted' ? (
          <>
            <h1 className={s.title}>Already accepted</h1>
            <p className={s.sub}>This invite has already been used. Sign in with your email and password.</p>
            <div className={s.foot}><Link to="/login">Sign in</Link></div>
          </>
        ) : invite.status === 'revoked' ? (
          <>
            <h1 className={s.title}>Invite revoked</h1>
            <p className={s.sub}>Please ask your manager for a new invitation.</p>
          </>
        ) : expired ? (
          <>
            <h1 className={s.title}>Invite expired</h1>
            <p className={s.sub}>Ask your manager to resend it from the team page.</p>
          </>
        ) : (
          <>
            <h1 className={s.title}>Join {invite.business_name}</h1>
            <p className={s.sub}>You're being added as a <strong>{invite.role}</strong>. Set a password to activate your account.</p>
            <form onSubmit={onSubmit} className={s.form}>
              <Field label="Email">
                <Input type="email" value={invite.email} disabled readOnly />
              </Field>
              <Field label="Your name">
                <Input value={fullName} onChange={e => setFullName(e.target.value)} required />
              </Field>
              <Field label="Choose a password" hint="At least 8 characters">
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </Field>
              {err && <div className={s.err}>{err}</div>}
              <Button type="submit" full loading={loading}>Activate account</Button>
            </form>
            <div className={s.foot}>
              <span>Already have an account with this email? <Link to="/login">Sign in</Link></span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
