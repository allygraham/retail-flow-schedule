import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import { acceptInviteSchema } from '@/lib/validation';
import { useAuth } from '@/features/auth/authContext';
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
  const { user, loading: authLoading, refresh, signOut } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [lookupDone, setLookupDone] = useState(false);

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const loginUrl = `/login?next=${encodeURIComponent(`/accept-invite?token=${encodeURIComponent(token)}`)}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setLookupErr('Missing invite token'); setLookupDone(true); return; }
      const { data, error } = await supabase.rpc('get_invitation_by_token', { _token: token });
      if (cancelled) return;
      if (error) { setLookupErr(error.message); setLookupDone(true); return; }
      const row = data?.[0] as InviteRow | undefined;
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
    if (authLoading || !usable) return;
    if (user && user.email?.toLowerCase() !== invite.email.toLowerCase()) {
      setErr(`Sign in with ${invite.email} to accept this invitation.`);
      return;
    }
    setLoading(true);
    try {
      if (!user) {
        const parsed = acceptInviteSchema.safeParse({ full_name: fullName, password });
        if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
        const { data, error } = await supabase.auth.signUp({
          email: invite.email, password,
          options: {
            data: { full_name: parsed.data.full_name },
            emailRedirectTo: `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`,
          },
        });
        if (error) { setErr(error.message); return; }
        if (!data.session) {
          setConfirmationPending(true);
          setPassword('');
          return;
        }
      }
      const { data: businessId, error } = await supabase.rpc('accept_invitation', { _token: token });
      if (error) { setErr(error.message); return; }
      await refresh(businessId ?? invite.business_id);
      nav('/dashboard', { replace: true });
    } catch {
      setErr('Could not accept your invitation. Please try again.');
    } finally { setLoading(false); }
  };

  if (!lookupDone || authLoading) {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <Logo />
          <LoadingSkeleton layout="form" label="Loading invitation" />
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
            <p className={s.sub}>You're being added as a <strong>{invite.role}</strong>. Confirm your account to join the team.</p>
            {confirmationPending && !user ? <p className={s.sub} role="status">Check your email for a confirmation link, then return here to join the team. If you already have an account, sign in below.</p> : user && user.email?.toLowerCase() !== invite.email.toLowerCase() ? <>
              <p className={s.err}>This invitation is for {invite.email}. You are signed in as {user.email}.</p>
              <Button full onClick={async () => { await signOut(); nav(loginUrl); }}>Sign in with invited email</Button>
            </> : <form onSubmit={onSubmit} className={s.form}>
              <Field label="Email">
                <Input type="email" value={invite.email} disabled readOnly />
              </Field>
              {!user && <><Field label="Your name">
                <Input value={fullName} onChange={e => setFullName(e.target.value)} required />
              </Field>
              <Field label="Choose a password" hint="At least 8 characters">
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </Field>
              </>}
              {err && <div className={s.err}>{err}</div>}
              <Button type="submit" full loading={loading}>{user ? 'Join team' : 'Activate account'}</Button>
            </form>}
            <div className={s.foot}>
              <span>Already have an account with this email? <Link to={loginUrl}>Sign in</Link></span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
