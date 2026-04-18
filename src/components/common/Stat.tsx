import { ReactNode } from 'react';
import s from './Stat.module.scss';

export function Stat({ label, value, hint, accent, icon }: { label: string; value: ReactNode; hint?: string; accent?: 'brand'|'warn'|'danger'|'success'; icon?: ReactNode }) {
  return (
    <div className={`${s.stat} ${accent ? s[accent] : ''}`}>
      {icon && <div className={s.icon}>{icon}</div>}
      <div className={s.label}>{label}</div>
      <div className={s.value}>{value}</div>
      {hint && <div className={s.hint}>{hint}</div>}
    </div>
  );
}
