import { ButtonHTMLAttributes, ReactNode, forwardRef } from 'react';
import s from './Button.module.scss';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: Size; full?: boolean; leading?: ReactNode; trailing?: ReactNode; loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', full, leading, trailing, loading, className, children, ...rest }, ref
) {
  return (
    <button
      ref={ref}
      className={`${s.btn} ${s[variant]} ${s[size]} ${full ? s.full : ''} ${className ?? ''}`}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading ? <span className={s.spin} /> : leading}
      <span>{children}</span>
      {trailing}
    </button>
  );
});
