import { Link } from 'react-router-dom';
import s from './Logo.module.scss';

export function Logo({ to = '/', size = 'md', light }: { to?: string; size?: 'sm'|'md'|'lg'; light?: boolean }) {
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
