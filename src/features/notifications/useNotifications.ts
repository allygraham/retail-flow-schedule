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
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    setItems((data as Notification[]) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) { setItems([]); return; }
    load();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  const unreadCount = items.filter(n => !n.read_at).length;

  const markRead = async (id: string) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  };

  const markAllRead = async () => {
    if (!userId) return;
    const ids = items.filter(n => !n.read_at).map(n => n.id);
    if (ids.length === 0) return;
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
  };

  return { items, unreadCount, loading, markRead, markAllRead, reload: load };
}
