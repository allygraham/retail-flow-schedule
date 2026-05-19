import { ReactNode, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import s from './CollapsibleSection.module.scss';

interface Props {
  title: ReactNode;
  /** Small caption rendered to the right of the title (e.g. summary while collapsed). */
  meta?: ReactNode;
  /** Optional icon shown before the title. */
  icon?: ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  /** Visual emphasis: 'default' (cards w/ border) | 'subtle' (ghost). */
  tone?: 'default' | 'subtle';
}

/**
 * Lightweight collapsible section used inside dense modals / detail panes.
 * Plain disclosure pattern — keyboard accessible, no animation library needed.
 */
export function CollapsibleSection({
  title, meta, icon, defaultOpen = false, open, onOpenChange, children, tone = 'default',
}: Props) {
  const [internal, setInternal] = useState(defaultOpen);
  const isControlled = typeof open === 'boolean';
  const isOpen = isControlled ? open : internal;
  const id = useId();

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setInternal(next);
    onOpenChange?.(next);
  };

  return (
    <section className={`${s.section} ${s[tone]} ${isOpen ? s.open : ''}`}>
      <button
        type="button"
        className={s.head}
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={toggle}
      >
        <ChevronDown size={14} className={s.chev} aria-hidden />
        {icon && <span className={s.icon}>{icon}</span>}
        <span className={s.title}>{title}</span>
        {meta && <span className={s.meta}>{meta}</span>}
      </button>
      <div id={id} className={s.body} hidden={!isOpen}>
        {isOpen && children}
      </div>
    </section>
  );
}
