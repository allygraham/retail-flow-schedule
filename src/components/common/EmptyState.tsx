import { ReactNode } from 'react';
import s from './EmptyState.module.scss';

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      {icon && <div className={s.icon}>{icon}</div>}
      <div className={s.title}>{title}</div>
      {description && <div className={s.desc}>{description}</div>}
      {action && <div className={s.action}>{action}</div>}
    </div>
  );
}
