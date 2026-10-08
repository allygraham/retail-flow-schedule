import { ReactNode } from 'react';
import s from './Stat.module.scss';

export function Stat({ label, value, hint, accent, icon, compact = false, muted = false, attention = false }: { label: string; value: ReactNode; hint?: string; accent?: 'brand'|'warn'|'danger'|'success'; icon?: ReactNode; compact?: boolean; muted?: boolean; attention?: boolean }) {
  return (
    <div data-attention={attention || undefined} className={`${s.stat} ${accent ? s[accent] : ''} ${compact ? s.compact : ''} ${muted ? s.muted : ''} ${attention ? s.attention : ''}`}>
      {icon && <div className={s.icon}>{icon}</div>}
      <div className={s.label}>{label}</div>
      <div className={s.value}>{value}</div>
      {hint && <div className={s.hint}>{hint}</div>}
    </div>
  );
}
