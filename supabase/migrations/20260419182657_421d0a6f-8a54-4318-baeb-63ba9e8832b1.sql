-- Notifications table for in-app notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  related_entity_type text,
  related_entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread
  ON public.notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX idx_notifications_user_recent
  ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Recipients can read their own notifications
CREATE POLICY "Users read own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Recipients can mark their own as read (or any update on their own row)
CREATE POLICY "Users update own notifications"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Recipients can delete their own notifications
CREATE POLICY "Users delete own notifications"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Managers/owners can create notifications for members of their business
CREATE POLICY "Managers create notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_manager_or_owner(auth.uid(), business_id)
    AND public.is_member(user_id, business_id)
  );

-- Enable realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;