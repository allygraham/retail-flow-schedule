import { ReactNode } from 'react';
import s from './Badge.module.scss';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'working' | 'leave' | 'sick' | 'dayoff' | 'pending' | 'unavail' | 'unassigned';

export function Badge({ tone = 'neutral', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`${s.badge} ${s[tone]}`}>
      {dot && <span className={s.dot} />}
      {children}
    </span>
  );
}
