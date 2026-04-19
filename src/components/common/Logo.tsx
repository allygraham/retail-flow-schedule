import { Link } from 'react-router-dom';
import { useBranding } from '@/features/branding/BrandingProvider';
import { useAuth } from '@/features/auth/AuthProvider';
import s from './Logo.module.scss';

interface Props { to?: string; size?: 'sm'|'md'|'lg'; light?: boolean; useBusinessLogo?: boolean }

export function Logo({ to = '/', size = 'md', light, useBusinessLogo }: Props) {
  // Safe call: outside provider, falls back to default Lavoro mark
  let logoUrl: string | null = null;
  let displayName: string | null = null;
  try {
    if (useBusinessLogo) {
      const { theme } = useBranding();
      const { business } = useAuth();
      logoUrl = theme.logoUrl;
      displayName = theme.displayName ?? business?.name ?? null;
    }
  } catch {
    /* not inside providers — fall back */
  }

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
