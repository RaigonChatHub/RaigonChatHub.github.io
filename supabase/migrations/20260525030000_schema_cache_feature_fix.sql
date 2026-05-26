CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ban_reason TEXT,
  ADD COLUMN IF NOT EXISTS admin_alert TEXT;

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS invite_code TEXT,
  ADD COLUMN IF NOT EXISTS invite_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS block_profanity BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS custom_blocked_words TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS managers_can_remove_members BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS managers_can_timeout_members BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS managers_can_ban_members BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS members_can_remove_members BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS members_can_ban_members BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bots_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS enabled_bots TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS announcement TEXT,
  ADD COLUMN IF NOT EXISTS announcement_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS announcement_updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_broadcast BOOLEAN DEFAULT FALSE;

UPDATE public.chats
SET invite_code = encode(gen_random_bytes(9), 'hex')
WHERE invite_code IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dob DATE := NULLIF(NEW.raw_user_meta_data->>'date_of_birth', '')::DATE;
  computed_age INTEGER;
BEGIN
  IF dob IS NOT NULL THEN
    computed_age := date_part('year', age(dob))::INTEGER;
  ELSE
    computed_age := NULLIF(NEW.raw_user_meta_data->>'age', '')::INTEGER;
  END IF;

  INSERT INTO public.profiles (id, username, display_name, role, age, date_of_birth, parent_email)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'user_name', ''), 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'user_name'),
    CASE WHEN NEW.raw_user_meta_data->>'user_name' = 'Admin' THEN 'admin' ELSE 'user' END,
    computed_age,
    dob,
    NEW.raw_user_meta_data->>'parent_email'
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    age = EXCLUDED.age,
    date_of_birth = EXCLUDED.date_of_birth,
    parent_email = EXCLUDED.parent_email;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.chats'::regclass
      AND conname = 'chats_invite_code_unique'
  ) THEN
    ALTER TABLE public.chats
      ADD CONSTRAINT chats_invite_code_unique UNIQUE (invite_code);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('ban', 'unban', 'alert', 'clear_alert')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_chat_member(target_chat_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_members cm
    WHERE cm.chat_id = target_chat_id AND cm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_chat(target_chat_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.chats c
    WHERE c.id = target_chat_id AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.chat_members cm
    WHERE cm.chat_id = target_chat_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_own_chat(target_chat_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.chats c
    WHERE c.id = target_chat_id AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.chat_members cm
    WHERE cm.chat_id = target_chat_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'owner'
  );
$$;

DROP FUNCTION IF EXISTS public.create_group_chat(TEXT, BOOLEAN, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_group_chat(
  chat_name TEXT,
  make_discoverable BOOLEAN DEFAULT FALSE,
  chat_image_url TEXT DEFAULT NULL,
  chat_banner_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_chat_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to create a chat.';
  END IF;

  IF NULLIF(trim(chat_name), '') IS NULL THEN
    RAISE EXCEPTION 'Chat name is required.';
  END IF;

  INSERT INTO public.chats (name, is_group, is_discoverable, created_by, image_url, banner_url)
  VALUES (trim(chat_name), TRUE, make_discoverable, auth.uid(), NULLIF(trim(chat_image_url), ''), NULLIF(trim(chat_banner_url), ''))
  RETURNING id INTO new_chat_id;

  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES (new_chat_id, auth.uid(), 'owner')
  ON CONFLICT (chat_id, user_id) DO UPDATE SET role = 'owner';

  RETURN new_chat_id;
END;
$$;

DROP FUNCTION IF EXISTS public.create_direct_message_by_username(TEXT);
CREATE OR REPLACE FUNCTION public.create_direct_message_by_username(target_username TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id UUID;
  target_label TEXT;
  current_label TEXT;
  existing_chat_id UUID;
  new_chat_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to start a direct message.';
  END IF;

  SELECT p.id, COALESCE(p.display_name, p.username)
  INTO target_user_id, target_label
  FROM public.profiles p
  WHERE lower(p.username) = lower(target_username)
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with that username.';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot start a direct message with yourself.';
  END IF;

  SELECT COALESCE(p.display_name, p.username)
  INTO current_label
  FROM public.profiles p
  WHERE p.id = auth.uid();

  SELECT c.id
  INTO existing_chat_id
  FROM public.chats c
  JOIN public.chat_members mine ON mine.chat_id = c.id AND mine.user_id = auth.uid()
  JOIN public.chat_members theirs ON theirs.chat_id = c.id AND theirs.user_id = target_user_id
  WHERE c.is_group = FALSE
    AND c.is_discoverable = FALSE
    AND (
      SELECT COUNT(*)
      FROM public.chat_members member_count
      WHERE member_count.chat_id = c.id
    ) = 2
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF existing_chat_id IS NOT NULL THEN
    RETURN existing_chat_id;
  END IF;

  INSERT INTO public.chats (name, is_group, is_discoverable, created_by)
  VALUES (COALESCE(current_label, 'User') || ' and ' || COALESCE(target_label, 'User'), FALSE, FALSE, auth.uid())
  RETURNING id INTO new_chat_id;

  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES
    (new_chat_id, auth.uid(), 'member'),
    (new_chat_id, target_user_id, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN new_chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.regenerate_chat_invite(target_chat_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_code TEXT := encode(gen_random_bytes(9), 'hex');
BEGIN
  IF NOT public.can_manage_chat(target_chat_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage this invite.';
  END IF;

  UPDATE public.chats c
  SET invite_code = next_code,
      invite_enabled = TRUE
  WHERE c.id = target_chat_id;

  RETURN next_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_discoverable_chat(target_chat_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a chat.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.chats c
    WHERE c.id = target_chat_id AND c.is_discoverable = TRUE
  ) THEN
    RAISE EXCEPTION 'This public chat is not available.';
  END IF;

  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES (target_chat_id, auth.uid(), 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_chat_with_invite(target_chat_id UUID, target_invite_code TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a chat.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.chats c
    WHERE c.id = target_chat_id
      AND (
        c.is_discoverable = TRUE
        OR (c.invite_enabled = TRUE AND c.invite_code = target_invite_code)
      )
  ) THEN
    RAISE EXCEPTION 'This invite is invalid or expired.';
  END IF;

  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES (target_chat_id, auth.uid(), 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_chat_ids()
RETURNS TABLE (chat_id UUID, member_role TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cm.chat_id, cm.role
  FROM public.chat_members cm
  WHERE cm.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_chat_members(target_chat_id UUID)
RETURNS TABLE (
  chat_id UUID,
  user_id UUID,
  member_role TEXT,
  joined_at TIMESTAMPTZ,
  username TEXT,
  display_name TEXT,
  platform_role TEXT,
  banned BOOLEAN,
  admin_alert TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cm.chat_id,
    cm.user_id,
    cm.role AS member_role,
    cm.joined_at,
    p.username,
    p.display_name,
    p.role AS platform_role,
    COALESCE(p.banned, FALSE) AS banned,
    p.admin_alert
  FROM public.chat_members cm
  JOIN public.profiles p ON p.id = cm.user_id
  WHERE cm.chat_id = target_chat_id
    AND (
      public.is_platform_admin()
      OR public.is_chat_member(target_chat_id)
      OR EXISTS (
        SELECT 1
        FROM public.chats c
        WHERE c.id = target_chat_id AND c.created_by = auth.uid()
      )
    )
  ORDER BY
    CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    cm.joined_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.add_chat_member_by_username(
  target_chat_id UUID,
  target_username TEXT,
  target_role TEXT DEFAULT 'member'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_user_id UUID;
  normalized_role TEXT := COALESCE(target_role, 'member');
BEGIN
  IF NOT public.can_manage_chat(target_chat_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage this chat.';
  END IF;

  IF normalized_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'Invalid member role.';
  END IF;

  IF normalized_role = 'admin' AND NOT public.can_own_chat(target_chat_id) THEN
    RAISE EXCEPTION 'Only chat owners and platform admins can assign chat admins.';
  END IF;

  SELECT p.id INTO found_user_id
  FROM public.profiles p
  WHERE lower(p.username) = lower(target_username)
  LIMIT 1;

  IF found_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with that username.';
  END IF;

  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES (target_chat_id, found_user_id, normalized_role)
  ON CONFLICT (chat_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN found_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_chat_member_role(
  target_chat_id UUID,
  target_user_id UUID,
  target_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_member_role TEXT;
  target_platform_role TEXT;
BEGIN
  IF target_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'Invalid member role.';
  END IF;

  IF NOT public.can_own_chat(target_chat_id) THEN
    RAISE EXCEPTION 'Only chat owners and platform admins can change manager roles.';
  END IF;

  SELECT cm.role, p.role
  INTO current_member_role, target_platform_role
  FROM public.chat_members cm
  JOIN public.profiles p ON p.id = cm.user_id
  WHERE cm.chat_id = target_chat_id AND cm.user_id = target_user_id;

  IF current_member_role = 'owner' THEN
    RAISE EXCEPTION 'Chat owners cannot be demoted here.';
  END IF;

  IF target_platform_role = 'admin' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can change platform admin chat roles.';
  END IF;

  UPDATE public.chat_members cm
  SET role = target_role
  WHERE cm.chat_id = target_chat_id AND cm.user_id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_chat_member(target_chat_id UUID, target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_member_role TEXT;
  target_platform_role TEXT;
BEGIN
  IF NOT public.can_manage_chat(target_chat_id) THEN
    RAISE EXCEPTION 'You do not have permission to remove members.';
  END IF;

  SELECT cm.role, p.role
  INTO target_member_role, target_platform_role
  FROM public.chat_members cm
  JOIN public.profiles p ON p.id = cm.user_id
  WHERE cm.chat_id = target_chat_id AND cm.user_id = target_user_id;

  IF target_member_role = 'owner' THEN
    RAISE EXCEPTION 'Chat owners cannot be removed.';
  END IF;

  IF target_platform_role = 'admin' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can remove platform admins.';
  END IF;

  DELETE FROM public.chat_members cm
  WHERE cm.chat_id = target_chat_id AND cm.user_id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_chat_settings(
  target_chat_id UUID,
  chat_name TEXT,
  chat_image_url TEXT DEFAULT NULL,
  chat_banner_url TEXT DEFAULT NULL,
  make_discoverable BOOLEAN DEFAULT NULL,
  block_words BOOLEAN DEFAULT NULL,
  blocked_words TEXT[] DEFAULT NULL,
  managers_remove BOOLEAN DEFAULT NULL,
  managers_timeout BOOLEAN DEFAULT NULL,
  managers_ban BOOLEAN DEFAULT NULL,
  members_remove BOOLEAN DEFAULT NULL,
  members_ban BOOLEAN DEFAULT NULL,
  bots_on BOOLEAN DEFAULT NULL,
  bot_list TEXT[] DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_chat(target_chat_id) THEN
    RAISE EXCEPTION 'You do not have permission to edit this chat.';
  END IF;

  UPDATE public.chats c
  SET name = COALESCE(NULLIF(trim(chat_name), ''), c.name),
      image_url = NULLIF(trim(chat_image_url), ''),
      banner_url = CASE WHEN c.is_group THEN NULLIF(trim(chat_banner_url), '') ELSE NULL END,
      is_discoverable = COALESCE(make_discoverable, c.is_discoverable),
      block_profanity = COALESCE(block_words, c.block_profanity),
      custom_blocked_words = COALESCE(blocked_words, c.custom_blocked_words),
      managers_can_remove_members = COALESCE(managers_remove, c.managers_can_remove_members),
      managers_can_timeout_members = COALESCE(managers_timeout, c.managers_can_timeout_members),
      managers_can_ban_members = COALESCE(managers_ban, c.managers_can_ban_members),
      members_can_remove_members = COALESCE(members_remove, c.members_can_remove_members),
      members_can_ban_members = COALESCE(members_ban, c.members_can_ban_members),
      bots_enabled = COALESCE(bots_on, c.bots_enabled),
      enabled_bots = COALESCE(bot_list, c.enabled_bots)
  WHERE c.id = target_chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pin_message(target_message_id UUID, pinned_value BOOLEAN DEFAULT TRUE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_chat_id UUID;
BEGIN
  SELECT m.chat_id INTO target_chat_id
  FROM public.messages m
  WHERE m.id = target_message_id;

  IF target_chat_id IS NULL THEN
    RAISE EXCEPTION 'Message not found.';
  END IF;

  IF NOT public.can_manage_chat(target_chat_id) THEN
    RAISE EXCEPTION 'You do not have permission to pin messages.';
  END IF;

  UPDATE public.messages m
  SET is_pinned = pinned_value
  WHERE m.id = target_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_group_broadcast(target_chat_id UUID, message_content TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_message_id UUID;
BEGIN
  IF NOT public.can_manage_chat(target_chat_id) THEN
    RAISE EXCEPTION 'You do not have permission to broadcast in this chat.';
  END IF;

  IF NULLIF(trim(message_content), '') IS NULL THEN
    RAISE EXCEPTION 'Broadcast message is required.';
  END IF;

  INSERT INTO public.messages (chat_id, sender_id, content, is_broadcast)
  VALUES (target_chat_id, auth.uid(), trim(message_content), TRUE)
  RETURNING id INTO new_message_id;

  UPDATE public.chats c
  SET announcement = trim(message_content),
      announcement_updated_at = NOW(),
      announcement_updated_by = auth.uid()
  WHERE c.id = target_chat_id;

  RETURN new_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_ban(target_user_id UUID, banned_value BOOLEAN, reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can ban users.';
  END IF;

  UPDATE public.profiles p
  SET banned = banned_value,
      ban_reason = CASE WHEN banned_value THEN reason ELSE NULL END
  WHERE p.id = target_user_id;

  INSERT INTO public.moderation_actions (actor_id, target_user_id, action, reason)
  VALUES (auth.uid(), target_user_id, CASE WHEN banned_value THEN 'ban' ELSE 'unban' END, reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_alert(target_user_id UUID, alert_text TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can alert users.';
  END IF;

  UPDATE public.profiles p
  SET admin_alert = NULLIF(alert_text, '')
  WHERE p.id = target_user_id;

  INSERT INTO public.moderation_actions (actor_id, target_user_id, action, reason)
  VALUES (auth.uid(), target_user_id, CASE WHEN NULLIF(alert_text, '') IS NULL THEN 'clear_alert' ELSE 'alert' END, alert_text);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_chat_profanity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blocked TEXT[];
  blocked_word TEXT;
BEGIN
  SELECT ARRAY(
    SELECT lower(item)
    FROM unnest(ARRAY['fuck', 'shit', 'bitch', 'asshole', 'damn']::TEXT[] || COALESCE(c.custom_blocked_words, '{}')) AS item
    WHERE NULLIF(trim(item), '') IS NOT NULL
  )
  INTO blocked
  FROM public.chats c
  WHERE c.id = NEW.chat_id AND c.block_profanity = TRUE;

  IF blocked IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH blocked_word IN ARRAY blocked LOOP
    IF lower(NEW.content) LIKE '%' || blocked_word || '%' THEN
      RAISE EXCEPTION 'This chat blocks that word.';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_chat_profanity ON public.messages;
CREATE TRIGGER trigger_enforce_chat_profanity
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_chat_profanity();

DROP POLICY IF EXISTS "Users can view chats they are members of." ON public.chats;
DROP POLICY IF EXISTS "Members discoverable and admins can view chats." ON public.chats;
CREATE POLICY "Members discoverable and admins can view chats." ON public.chats
  FOR SELECT USING (
    is_discoverable = TRUE
    OR created_by = auth.uid()
    OR public.is_platform_admin()
    OR public.is_chat_member(id)
  );

DROP POLICY IF EXISTS "Authenticated users can create chats." ON public.chats;
DROP POLICY IF EXISTS "Authenticated users can create own chats." ON public.chats;
CREATE POLICY "Authenticated users can create own chats." ON public.chats
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

DROP POLICY IF EXISTS "Creators and admins can update chats." ON public.chats;
DROP POLICY IF EXISTS "Creators managers and admins can update chats." ON public.chats;
CREATE POLICY "Creators managers and admins can update chats." ON public.chats
  FOR UPDATE USING (public.can_manage_chat(id))
  WITH CHECK (public.can_manage_chat(id));

DROP POLICY IF EXISTS "Creators and admins can delete chats." ON public.chats;
CREATE POLICY "Creators and admins can delete chats." ON public.chats
  FOR DELETE USING (created_by = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "Members can view other members of their chats." ON public.chat_members;
DROP POLICY IF EXISTS "Members and admins can view chat memberships." ON public.chat_members;
CREATE POLICY "Members and admins can view chat memberships." ON public.chat_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_platform_admin()
    OR public.is_chat_member(chat_id)
  );

DROP POLICY IF EXISTS "Users can join discoverable or owned chats." ON public.chat_members;
DROP POLICY IF EXISTS "Users can create their own membership rows." ON public.chat_members;
CREATE POLICY "Users can create their own membership rows." ON public.chat_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users and admins can remove memberships." ON public.chat_members;
CREATE POLICY "Users owners and admins can remove memberships." ON public.chat_members
  FOR DELETE USING (user_id = auth.uid() OR public.can_manage_chat(chat_id));

DROP POLICY IF EXISTS "Chat owners and platform admins can update memberships." ON public.chat_members;
CREATE POLICY "Chat owners and platform admins can update memberships." ON public.chat_members
  FOR UPDATE USING (public.can_own_chat(chat_id))
  WITH CHECK (public.can_own_chat(chat_id));

DROP POLICY IF EXISTS "Members can view messages in their chats." ON public.messages;
DROP POLICY IF EXISTS "Members and admins can view messages in their chats." ON public.messages;
CREATE POLICY "Members and admins can view messages in their chats." ON public.messages
  FOR SELECT USING (public.is_platform_admin() OR public.is_chat_member(chat_id));

DROP POLICY IF EXISTS "Members can insert messages in their chats." ON public.messages;
DROP POLICY IF EXISTS "Members can insert their own messages in their chats." ON public.messages;
CREATE POLICY "Members can insert their own messages in their chats." ON public.messages
  FOR INSERT WITH CHECK (sender_id = auth.uid() AND public.is_chat_member(chat_id));

DROP POLICY IF EXISTS "Admins can delete messages." ON public.messages;
CREATE POLICY "Managers and admins can delete messages." ON public.messages
  FOR DELETE USING (public.can_manage_chat(chat_id) OR sender_id = auth.uid());

DROP POLICY IF EXISTS "Managers and admins can update messages." ON public.messages;
CREATE POLICY "Managers and admins can update messages." ON public.messages
  FOR UPDATE USING (public.can_manage_chat(chat_id))
  WITH CHECK (public.can_manage_chat(chat_id));

DROP POLICY IF EXISTS "Platform admins can view moderation actions." ON public.moderation_actions;
CREATE POLICY "Platform admins can view moderation actions." ON public.moderation_actions
  FOR SELECT USING (public.is_platform_admin());

GRANT EXECUTE ON FUNCTION public.create_group_chat(TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_direct_message_by_username(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_chat_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_discoverable_chat(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_chat_with_invite(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_chat_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_members(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_chat_member_by_username(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_chat_member_role(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_chat_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_chat_settings(UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pin_message(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_group_broadcast(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_ban(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_alert(UUID, TEXT) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_members;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
  END IF;
END $$;
