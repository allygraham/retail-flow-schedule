import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef, ReactNode } from 'react';
import s from './Field.module.scss';

interface Wrap { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; }
export function Field({ label, hint, error, children }: Wrap) {
  return (
    <div className={s.field}>
      {label && <div className={s.label}>{label}</div>}
      {children}
      {error ? <span className={s.error}>{error}</span> : hint ? <span className={s.hint}>{hint}</span> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={`${s.input} ${className ?? ''}`} {...rest} />;
  }
);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return <select ref={ref} className={`${s.input} ${s.select} ${className ?? ''}`} {...rest}>{children}</select>;
  }
);
export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={`${s.input} ${s.textarea} ${className ?? ''}`} {...rest} />;
  }
);
