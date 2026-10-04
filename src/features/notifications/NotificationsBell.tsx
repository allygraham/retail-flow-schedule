import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/features/auth/authContext';
import { useNotifications, type Notification } from './useNotifications';
import s from './NotificationsBell.module.scss';

type Props = { variant?: 'mobile' | 'desktop' };

export function NotificationsBell({ variant = 'desktop' }: Props) {
  const { user } = useAuth();
  const nav = useNavigate();
  const { items, unreadCount, markRead, markAllRead } = useNotifications(user?.id);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const update = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const panelW = Math.min(360, window.innerWidth - 24);
      const top = r.bottom + 8;
      const left = variant === 'desktop'
        ? Math.min(r.left, window.innerWidth - panelW - 12)
        : Math.max(12, r.right - panelW);
      setPos({ top, left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, variant]);

  const onClickItem = async (n: Notification) => {
    if (!n.read_at) await markRead(n.id);
    setOpen(false);
    if (n.link) nav(n.link);
  };

  return (
    <div className={s.wrap}>
      <button
        ref={btnRef}
        type="button"
        className={`${s.btn} ${variant === 'desktop' ? s.btnDesktop : ''}`}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className={s.dot}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && pos && createPortal(
        <>
          <div className={s.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className={s.panel}
            role="dialog"
            aria-label="Notifications"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className={s.head}>
              <span className={s.title}>Notifications</span>
              <button
                type="button"
                className={s.markAll}
                onClick={markAllRead}
                disabled={unreadCount === 0}
              >
                Mark all read
              </button>
            </div>
            <div className={s.list}>
              {items.length === 0 ? (
                <div className={s.empty}>You're all caught up.</div>
              ) : items.map(n => (
                <button
                  key={n.id}
                  type="button"
                  className={`${s.item} ${!n.read_at ? s.itemUnread : ''}`}
                  onClick={() => onClickItem(n)}
                >
                  <div className={s.itemRow}>
                    {!n.read_at && <span className={s.unreadDot} aria-hidden="true" />}
                    <div className={s.itemBody}>
                      <div className={s.itemTitle}>{n.title}</div>
                      {n.body && <div className={s.itemText}>{n.body}</div>}
                      <div className={s.itemTime}>{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
