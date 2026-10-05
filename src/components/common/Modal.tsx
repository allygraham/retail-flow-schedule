import { ReactNode, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import s from './Modal.module.scss';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  bottomSheet?: boolean;
}

export function Modal({ open, onClose, title, children, footer, size = 'md', bottomSheet = false }: Props) {
  const opener = useRef<HTMLElement | null>(null);
  const isOpen = useRef(open);
  isOpen.current = open;
  // A menu item may disappear before the dialog mounts. Remember its menu
  // trigger while focus is still in the menu, rather than restoring a removed item.
  const focusOrigin = (element: HTMLElement) => {
    const triggerId = element.closest('[role="menu"]')?.getAttribute('aria-labelledby');
    return (triggerId ? document.getElementById(triggerId) : null) ?? element;
  };
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      if (!isOpen.current && event.target instanceof HTMLElement && event.target !== document.body) {
        opener.current = focusOrigin(event.target);
      }
    };
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, []);
  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={`${s.backdrop} ${bottomSheet ? s.backdropSheet : ''}`}>
          <Dialog.Content className={`${s.dialog} ${s[size]} ${bottomSheet ? s.sheet : ''}`}
            aria-modal="true" aria-describedby={undefined}
            onOpenAutoFocus={() => {
              const active = document.activeElement;
              if (active instanceof HTMLElement && active !== document.body) opener.current = focusOrigin(active);
            }}
            onCloseAutoFocus={event => {
              event.preventDefault();
              if (opener.current?.isConnected) opener.current.focus();
            }}>
            <header className={s.head}>
              {bottomSheet && <div className={s.grabber} aria-hidden />}
              <Dialog.Title className={title ? s.title : s.srOnly}>{title ?? 'Dialog'}</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className={s.close} aria-label="Close">×</button>
              </Dialog.Close>
            </header>
            <div className={s.body}>{children}</div>
            {footer && <footer className={s.foot}>{footer}</footer>}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
