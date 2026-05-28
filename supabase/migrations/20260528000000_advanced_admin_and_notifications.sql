-- 1. Enhanced Bans and Warnings for Profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ban_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_warning BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_seen_version TEXT DEFAULT '0.0.0';

-- 2. Chat Cooldown and Admin View Tracking
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS message_interval_seconds INTEGER DEFAULT 0;

-- 3. Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'system', 'mention', 'reply', 'moderation'
  title TEXT,
  content TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications." ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications." ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- 4. Update Logs Table
CREATE TABLE IF NOT EXISTS public.update_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.update_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view update logs." ON public.update_logs
  FOR SELECT USING (TRUE);

CREATE POLICY "Admins can manage update logs." ON public.update_logs
  FOR ALL USING (public.is_admin());

-- 5. RPC: Send System Notification
CREATE OR REPLACE FUNCTION public.send_system_notification(
  target_user_id UUID,
  notif_title TEXT,
  notif_content TEXT,
  notif_type TEXT DEFAULT 'system',
  notif_link TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, content, type, link)
  VALUES (target_user_id, notif_title, notif_content, notif_type, notif_link);
END;
$$;

-- 6. RPC: Platform Ban/Warn User
CREATE OR REPLACE FUNCTION public.moderate_user(
  target_id UUID,
  action_type TEXT, -- 'ban', 'warn', 'terminate', 'unban'
  reason_text TEXT,
  expiry TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;

  IF action_type = 'terminate' THEN
    UPDATE public.profiles
    SET banned = TRUE, ban_reason = reason_text, ban_expires_at = NULL, is_warning = FALSE
    WHERE id = target_id;
  ELSIF action_type = 'ban' THEN
    UPDATE public.profiles
    SET banned = TRUE, ban_reason = reason_text, ban_expires_at = expiry, is_warning = FALSE
    WHERE id = target_id;
  ELSIF action_type = 'warn' THEN
    UPDATE public.profiles
    SET is_warning = TRUE, admin_alert = reason_text
    WHERE id = target_id;
  ELSIF action_type = 'unban' THEN
    UPDATE public.profiles
    SET banned = FALSE, ban_reason = NULL, ban_expires_at = NULL, is_warning = FALSE
    WHERE id = target_id;
  END IF;

  -- Log the moderation action (assuming moderation_actions table exists from previous migrations)
  -- INSERT INTO public.moderation_actions (actor_id, target_user_id, action, reason)
  -- VALUES (auth.uid(), target_id, action_type, reason_text);

  -- Send notification to user
  PERFORM public.send_system_notification(
    target_id,
    'Account Update',
    'Your account status has been updated: ' || action_type || '. Reason: ' || reason_text,
    'moderation'
  );
END;
$$;

-- 7. Fix: Allow clearing announcements
CREATE OR REPLACE FUNCTION public.clear_chat_announcement(target_chat_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_chat(target_chat_id) THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;

  UPDATE public.chats
  SET announcement = NULL, announcement_updated_at = NOW()
  WHERE id = target_chat_id;
END;
$$;

-- 8. Enable Realtime for notifications and update logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'update_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.update_logs;
  END IF;
END $$;

-- 11. Improved Broadcast (also adds to chat history)
CREATE OR REPLACE FUNCTION public.send_group_broadcast(target_chat_id UUID, message_content TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_chat(target_chat_id) THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;

  -- Update the floating announcement
  UPDATE public.chats
  SET announcement = message_content, announcement_updated_at = NOW()
  WHERE id = target_chat_id;

  -- Insert into chat history as a broadcast message
  INSERT INTO public.messages (chat_id, sender_id, content, is_broadcast)
  VALUES (target_chat_id, auth.uid(), message_content, TRUE);
END;
$$;

-- 12. Trigger for System Messages on Join
CREATE OR REPLACE FUNCTION public.on_chat_event()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'chat_members' THEN
    INSERT INTO public.messages (chat_id, sender_id, content, is_broadcast)
    VALUES (NEW.chat_id, NULL, 'A new member has joined the room.', TRUE);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_chat_join ON public.chat_members;
CREATE TRIGGER trigger_chat_join
  AFTER INSERT ON public.chat_members
  FOR EACH ROW EXECUTE FUNCTION public.on_chat_event();

-- 13. Platform Admin Global Access Override
CREATE OR REPLACE FUNCTION public.can_manage_chat(target_chat_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.chats WHERE id = target_chat_id AND created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.chat_members 
    WHERE chat_id = target_chat_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.send_group_broadcast(UUID, TEXT) TO authenticated;
