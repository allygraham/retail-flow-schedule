import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef, ReactNode, Children, isValidElement, useId } from 'react';
import s from './Field.module.scss';
import { FieldContext, useFieldControl } from './fieldContext';

interface Wrap { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; }
export function Field({ label, hint, error, children }: Wrap) {
  const generated = useId();
  const elements = Children.toArray(children);
  const child = elements.length === 1 && isValidElement<{ id?: string }>(elements[0]) ? elements[0] : null;
  const singleControl = child && (child.type === Input || child.type === Select || child.type === TextArea);
  const controlId = singleControl ? child.props.id ?? `${generated}-control` : undefined;
  const labelId = label ? `${generated}-label` : undefined;
  const descriptionId = error || hint ? `${generated}-description` : undefined;
  return (
    <FieldContext.Provider value={{ labelId, controlId, descriptionId, invalid: !!error }}>
      <div className={s.field} role={!singleControl && label ? 'group' : undefined} aria-labelledby={!singleControl ? labelId : undefined}>
        {label && (controlId
          ? <label id={labelId} htmlFor={controlId} className={s.label}>{label}</label>
          : <div id={labelId} className={s.label}>{label}</div>)}
        {children}
        {error ? <span id={descriptionId} role="alert" className={s.error}>{error}</span> : hint ? <span id={descriptionId} className={s.hint}>{hint}</span> : null}
      </div>
    </FieldContext.Provider>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    const field = useFieldControl(rest.id, rest['aria-describedby']);
    return <input ref={ref} className={`${s.input} ${className ?? ''}`} {...field} {...rest} id={field.id} aria-labelledby={rest['aria-labelledby'] ?? (rest['aria-label'] ? undefined : field['aria-labelledby'])} aria-describedby={field['aria-describedby']} aria-invalid={field['aria-invalid'] ?? rest['aria-invalid']} />;
  }
);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    const field = useFieldControl(rest.id, rest['aria-describedby']);
    return <select ref={ref} className={`${s.input} ${s.select} ${className ?? ''}`} {...field} {...rest} id={field.id} aria-labelledby={rest['aria-labelledby'] ?? (rest['aria-label'] ? undefined : field['aria-labelledby'])} aria-describedby={field['aria-describedby']} aria-invalid={field['aria-invalid'] ?? rest['aria-invalid']}>{children}</select>;
  }
);
export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    const field = useFieldControl(rest.id, rest['aria-describedby']);
    return <textarea ref={ref} className={`${s.input} ${s.textarea} ${className ?? ''}`} {...field} {...rest} id={field.id} aria-labelledby={rest['aria-labelledby'] ?? (rest['aria-label'] ? undefined : field['aria-labelledby'])} aria-describedby={field['aria-describedby']} aria-invalid={field['aria-invalid'] ?? rest['aria-invalid']} />;
  }
);
