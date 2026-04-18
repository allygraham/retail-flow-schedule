import { HTMLAttributes, ReactNode } from 'react';
import s from './Card.module.scss';

interface Props extends HTMLAttributes<HTMLDivElement> {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  padded?: boolean;
  children?: ReactNode;
}

export function Card({ title, subtitle, action, padded = true, className, children, ...rest }: Props) {
  return (
    <div className={`${s.card} ${className ?? ''}`} {...rest}>
      {(title || action) && (
        <div className={s.head}>
          <div>
            {title && <div className={s.title}>{title}</div>}
            {subtitle && <div className={s.sub}>{subtitle}</div>}
          </div>
          {action && <div className={s.action}>{action}</div>}
        </div>
      )}
      <div className={padded ? s.body : s.bodyFlush}>{children}</div>
    </div>
  );
}
