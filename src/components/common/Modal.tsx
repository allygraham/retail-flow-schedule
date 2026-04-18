import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import s from './Modal.module.scss';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: Props) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className={s.backdrop} onClick={onClose}>
      <div className={`${s.dialog} ${s[size]}`} onClick={e => e.stopPropagation()} role="dialog">
        {title && (
          <header className={s.head}>
            <div className={s.title}>{title}</div>
            <button className={s.close} onClick={onClose} aria-label="Close">×</button>
          </header>
        )}
        <div className={s.body}>{children}</div>
        {footer && <footer className={s.foot}>{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}
