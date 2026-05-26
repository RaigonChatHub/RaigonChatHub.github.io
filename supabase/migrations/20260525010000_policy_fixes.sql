CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
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
    FROM public.chat_members
    WHERE chat_id = target_chat_id AND user_id = auth.uid()
  );
$$;

UPDATE auth.users
SET
  aud = 'authenticated',
  role = 'authenticated',
  email = 'admin@raigon.com',
  encrypted_password = crypt('zo@873387DNH', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
  raw_user_meta_data = '{"user_name": "Admin", "full_name": "Max"}'::jsonb,
  updated_at = NOW()
WHERE id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';

INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  '{"sub": "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", "email": "admin@raigon.com", "email_verified": true, "phone_verified": false}'::jsonb,
  'email',
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (provider_id, provider) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  identity_data = EXCLUDED.identity_data,
  updated_at = NOW();

UPDATE public.profiles
SET username = 'Admin', display_name = 'Max', role = 'admin'
WHERE id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';

INSERT INTO public.profiles (id, username, display_name, role)
VALUES (
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  'Admin',
  'Max',
  'admin'
) ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role;

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(9), 'hex'),
  ADD COLUMN IF NOT EXISTS invite_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ban_reason TEXT,
  ADD COLUMN IF NOT EXISTS admin_alert TEXT;

CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('ban', 'unban', 'alert', 'clear_alert')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

UPDATE public.chats
SET invite_code = encode(gen_random_bytes(9), 'hex')
WHERE invite_code IS NULL;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_chat(target_chat_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
  OR EXISTS (
    SELECT 1
    FROM public.chats
    WHERE id = target_chat_id AND created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.chat_members
    WHERE chat_id = target_chat_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_own_chat(target_chat_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
  OR EXISTS (
    SELECT 1
    FROM public.chats
    WHERE id = target_chat_id AND created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.chat_members
    WHERE chat_id = target_chat_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
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
        SELECT 1 FROM public.chats
        WHERE id = target_chat_id AND created_by = auth.uid()
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
RETURNS TABLE (added_user_id UUID)
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

  SELECT id INTO found_user_id
  FROM public.profiles
  WHERE lower(username) = lower(target_username)
  LIMIT 1;

  IF found_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with that username.';
  END IF;

  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES (target_chat_id, found_user_id, normalized_role)
  ON CONFLICT (chat_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN QUERY SELECT found_user_id;
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
  current_role TEXT;
  target_platform_role TEXT;
BEGIN
  IF target_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'Invalid member role.';
  END IF;

  IF NOT public.can_own_chat(target_chat_id) THEN
    RAISE EXCEPTION 'Only chat owners and platform admins can change manager roles.';
  END IF;

  SELECT cm.role, p.role INTO current_role, target_platform_role
  FROM public.chat_members cm
  JOIN public.profiles p ON p.id = cm.user_id
  WHERE cm.chat_id = target_chat_id AND cm.user_id = target_user_id;

  IF current_role = 'owner' THEN
    RAISE EXCEPTION 'Chat owners cannot be demoted here.';
  END IF;

  IF target_platform_role = 'admin' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can change platform admin chat roles.';
  END IF;

  UPDATE public.chat_members
  SET role = target_role
  WHERE chat_id = target_chat_id AND user_id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_chat_member(
  target_chat_id UUID,
  target_user_id UUID
)
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

  SELECT cm.role, p.role INTO target_member_role, target_platform_role
  FROM public.chat_members cm
  JOIN public.profiles p ON p.id = cm.user_id
  WHERE cm.chat_id = target_chat_id AND cm.user_id = target_user_id;

  IF target_member_role = 'owner' THEN
    RAISE EXCEPTION 'Chat owners cannot be removed.';
  END IF;

  IF target_platform_role = 'admin' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can remove platform admins.';
  END IF;

  DELETE FROM public.chat_members
  WHERE chat_id = target_chat_id AND user_id = target_user_id;
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

  UPDATE public.chats
  SET invite_code = next_code, invite_enabled = TRUE
  WHERE id = target_chat_id;

  RETURN next_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_chat_with_invite(
  target_chat_id UUID,
  target_invite_code TEXT
)
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
    FROM public.chats
    WHERE id = target_chat_id
      AND (
        is_discoverable = TRUE
        OR (invite_enabled = TRUE AND invite_code = target_invite_code)
      )
  ) THEN
    RAISE EXCEPTION 'This invite is invalid or expired.';
  END IF;

  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES (target_chat_id, auth.uid(), 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_direct_message_by_username(target_username TEXT)
RETURNS TABLE (chat_id UUID)
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

  SELECT id, COALESCE(display_name, username)
  INTO target_user_id, target_label
  FROM public.profiles
  WHERE lower(username) = lower(target_username)
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with that username.';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot start a direct message with yourself.';
  END IF;

  SELECT COALESCE(display_name, username)
  INTO current_label
  FROM public.profiles
  WHERE id = auth.uid();

  SELECT c.id
  INTO existing_chat_id
  FROM public.chats c
  JOIN public.chat_members mine ON mine.chat_id = c.id AND mine.user_id = auth.uid()
  JOIN public.chat_members theirs ON theirs.chat_id = c.id AND theirs.user_id = target_user_id
  WHERE c.is_group = FALSE
    AND c.is_discoverable = FALSE
    AND (
      SELECT COUNT(*)
      FROM public.chat_members cm
      WHERE cm.chat_id = c.id
    ) = 2
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF existing_chat_id IS NOT NULL THEN
    RETURN QUERY SELECT existing_chat_id;
    RETURN;
  END IF;

  INSERT INTO public.chats (name, is_group, is_discoverable, created_by)
  VALUES (COALESCE(current_label, 'User') || ' and ' || COALESCE(target_label, 'User'), FALSE, FALSE, auth.uid())
  RETURNING id INTO new_chat_id;

  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES
    (new_chat_id, auth.uid(), 'member'),
    (new_chat_id, target_user_id, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN QUERY SELECT new_chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_ban(
  target_user_id UUID,
  banned_value BOOLEAN,
  reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can ban users.';
  END IF;

  UPDATE public.profiles
  SET banned = banned_value,
      ban_reason = CASE WHEN banned_value THEN reason ELSE NULL END
  WHERE id = target_user_id;

  INSERT INTO public.moderation_actions (actor_id, target_user_id, action, reason)
  VALUES (auth.uid(), target_user_id, CASE WHEN banned_value THEN 'ban' ELSE 'unban' END, reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_alert(
  target_user_id UUID,
  alert_text TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can alert users.';
  END IF;

  UPDATE public.profiles
  SET admin_alert = NULLIF(alert_text, '')
  WHERE id = target_user_id;

  INSERT INTO public.moderation_actions (actor_id, target_user_id, action, reason)
  VALUES (auth.uid(), target_user_id, CASE WHEN NULLIF(alert_text, '') IS NULL THEN 'clear_alert' ELSE 'alert' END, alert_text);
END;
$$;

DROP POLICY IF EXISTS "Users can view chats they are members of." ON public.chats;
DROP POLICY IF EXISTS "Authenticated users can create chats." ON public.chats;
DROP POLICY IF EXISTS "Authenticated users can create own chats." ON public.chats;
DROP POLICY IF EXISTS "Admins can view all chats." ON public.chats;
DROP POLICY IF EXISTS "Creators and admins can update chats." ON public.chats;
DROP POLICY IF EXISTS "Creators and admins can delete chats." ON public.chats;
DROP POLICY IF EXISTS "Members discoverable and admins can view chats." ON public.chats;

CREATE POLICY "Members discoverable and admins can view chats." ON public.chats
  FOR SELECT USING (
    is_discoverable = true
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.chat_members
      WHERE chat_id = public.chats.id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can create own chats." ON public.chats
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

CREATE POLICY "Creators and admins can update chats." ON public.chats
  FOR UPDATE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Creators and admins can delete chats." ON public.chats
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Members can view other members of their chats." ON public.chat_members;
DROP POLICY IF EXISTS "Users can join discoverable or owned chats." ON public.chat_members;
DROP POLICY IF EXISTS "Users and admins can remove memberships." ON public.chat_members;
DROP POLICY IF EXISTS "Members and admins can view chat memberships." ON public.chat_members;
DROP POLICY IF EXISTS "Chat owners and platform admins can update memberships." ON public.chat_members;

CREATE POLICY "Members and admins can view chat memberships." ON public.chat_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can join discoverable or owned chats." ON public.chat_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users and admins can remove memberships." ON public.chat_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.chats
      WHERE id = public.chat_members.chat_id AND created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Chat owners and platform admins can update memberships." ON public.chat_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.chats
      WHERE id = public.chat_members.chat_id AND created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chats
      WHERE id = public.chat_members.chat_id AND created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Members can view messages in their chats." ON public.messages;
DROP POLICY IF EXISTS "Members can insert messages in their chats." ON public.messages;
DROP POLICY IF EXISTS "Members can insert their own messages in their chats." ON public.messages;
DROP POLICY IF EXISTS "Admins can view all messages." ON public.messages;
DROP POLICY IF EXISTS "Admins can delete messages." ON public.messages;
DROP POLICY IF EXISTS "Members and admins can view messages in their chats." ON public.messages;

CREATE POLICY "Members and admins can view messages in their chats." ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.chat_members
      WHERE chat_id = public.messages.chat_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Members can insert their own messages in their chats." ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.chat_members
      WHERE chat_id = public.messages.chat_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can delete messages." ON public.messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_members;
  END IF;
END $$;
