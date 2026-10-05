import { useAsyncData } from '@/hooks/useAsyncData';
import { assertQueryResults } from '@/lib/queryResults';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type Notification = {
  id: string;
  business_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

export function useNotifications(userId: string | undefined) {
  const [saving, setSaving] = useState(false);
  const [writeError, setWriteError] = useState<{ userId: string; message: string } | null>(null);
  const fetchItems = useCallback(async () => {
    if (!userId) return [];
    const result = await supabase.from('notifications').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(30);
    assertQueryResults(result);
    return result.data as Notification[] ?? [];
  }, [userId]);
  const { data, loading, error, reload: load } = useAsyncData(fetchItems, 'Could not load notifications. Please try again.');
  const items = data ?? [];

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  // Realtime can miss events while offline or suspended. Reconcile on return
  // and periodically while visible so a dropped subscription cannot leave stale notices.
  useEffect(() => {
    if (!userId) return;
    const reconcile = () => { if (document.visibilityState !== 'hidden') void load(); };
    window.addEventListener('focus', reconcile);
    window.addEventListener('online', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    const timer = window.setInterval(reconcile, 60_000);
    return () => {
      window.removeEventListener('focus', reconcile);
      window.removeEventListener('online', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
      window.clearInterval(timer);
    };
  }, [userId, load]);

  const unreadCount = items.filter(n => !n.read_at).length;

  const saveRead = async (ids: string[]) => {
    if (!userId || saving) return false;
    if (!ids.length) return true;
    setSaving(true);
    setWriteError(null);
    try {
      const result = await supabase.from('notifications')
        .update({ read_at: new Date().toISOString() }).eq('user_id', userId).in('id', ids).select('id');
      assertQueryResults(result);
      if (result.data?.length !== ids.length) throw new Error('Notifications were not updated');
      await load();
      return true;
    } catch {
      setWriteError({ userId, message: 'Could not mark notifications as read. Please try again.' });
      return false;
    } finally { setSaving(false); }
  };
  const markRead = (id: string) => saveRead([id]);
  const markAllRead = () => saveRead(items.filter(n => !n.read_at).map(n => n.id));

  return { items, unreadCount, loading, error, saving, writeError: writeError && writeError.userId === userId ? writeError.message : null, markRead, markAllRead, reload: load };
}
