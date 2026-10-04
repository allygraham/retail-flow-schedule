import { Link } from 'react-router-dom';
import { useOptionalBranding } from '@/features/branding/brandingContext';
import { useOptionalAuth } from '@/features/auth/authContext';
import s from './Logo.module.scss';

interface Props { to?: string; size?: 'sm'|'md'|'lg'; light?: boolean; useBusinessLogo?: boolean }

export function Logo({ to = '/', size = 'md', light, useBusinessLogo }: Props) {
  const branding = useOptionalBranding();
  const auth = useOptionalAuth();
  const logoUrl = branding?.theme.logoUrl ?? null;
  const displayName = branding?.theme.displayName ?? auth?.business?.name ?? null;

  if (useBusinessLogo && logoUrl) {
    return (
      <Link to={to} className={`${s.wrap} ${s[size]} ${light ? s.light : ''} ${s.logoImg}`} aria-label={displayName ?? 'Workspace'}>
        <img src={logoUrl} alt={displayName ?? 'Workspace logo'} className={s.img} />
      </Link>
    );
  }

  if (useBusinessLogo && displayName) {
    return (
      <Link to={to} className={`${s.wrap} ${s[size]} ${light ? s.light : ''}`}>
        <span className={s.word}>{displayName}</span>
      </Link>
    );
  }

  return (
    <Link to={to} className={`${s.wrap} ${s[size]} ${light ? s.light : ''}`}>
      <span className={s.mark} aria-hidden>
        <span className={s.bar} />
        <span className={s.bar} />
        <span className={s.bar} />
      </span>
      <span className={s.word}>Lavoro</span>
    </Link>
  );
}
