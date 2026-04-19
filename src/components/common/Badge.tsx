import { ReactNode, forwardRef } from 'react';
import s from './Badge.module.scss';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'working' | 'leave' | 'sick' | 'dayoff' | 'pending' | 'unavail' | 'unassigned';

interface Props {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, Props>(function Badge(
  { tone = 'neutral', children, dot }, ref
) {
  return (
    <span ref={ref} className={`${s.badge} ${s[tone]}`}>
      {dot && <span className={s.dot} />}
      {children}
    </span>
  );
});
