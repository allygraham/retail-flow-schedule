import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/features/auth/AuthProvider';
import { useNotifications, type Notification } from './useNotifications';
import s from './NotificationsBell.module.scss';

type Props = { variant?: 'mobile' | 'desktop' };

export function NotificationsBell({ variant = 'desktop' }: Props) {
  const { user } = useAuth();
  const nav = useNavigate();
  const { items, unreadCount, markRead, markAllRead } = useNotifications(user?.id);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const onClickItem = async (n: Notification) => {
    if (!n.read_at) await markRead(n.id);
    setOpen(false);
    if (n.link) nav(n.link);
  };

  return (
    <div className={s.wrap} ref={wrapRef}>
      <button
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

      {open && (
        <>
          <div className={s.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />
          <div className={`${s.panel} ${variant === 'mobile' ? s.panelLeft : ''}`} role="dialog" aria-label="Notifications">
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
        </>
      )}
    </div>
  );
}
