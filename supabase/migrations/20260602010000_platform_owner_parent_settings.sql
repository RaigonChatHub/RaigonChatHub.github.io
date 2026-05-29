-- Platform owner role, parent approval, admin permissions, and missing chat settings.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin', 'owner'));

UPDATE public.profiles
SET role = 'owner'
WHERE role = 'admin';

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS require_join_approval BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS members_can_invite BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_member_list BOOLEAN DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS public.admin_permission_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  admins_can_ban_users BOOLEAN NOT NULL DEFAULT TRUE,
  admins_can_delete_platform_admins BOOLEAN NOT NULL DEFAULT FALSE,
  admins_can_promote_admins BOOLEAN NOT NULL DEFAULT FALSE,
  admins_can_manage_updates BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.admin_permission_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.admin_permission_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform staff can view admin settings." ON public.admin_permission_settings;
CREATE POLICY "Platform staff can view admin settings." ON public.admin_permission_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "Platform owners can update admin settings." ON public.admin_permission_settings;
CREATE POLICY "Platform owners can update admin settings." ON public.admin_permission_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION public.can_platform_admin(permission_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role TEXT;
  settings public.admin_permission_settings%ROWTYPE;
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = auth.uid();
  IF actor_role = 'owner' THEN
    RETURN TRUE;
  END IF;
  IF actor_role != 'admin' THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO settings FROM public.admin_permission_settings WHERE id = 1;
  RETURN CASE permission_name
    WHEN 'ban_users' THEN settings.admins_can_ban_users
    WHEN 'delete_platform_admins' THEN settings.admins_can_delete_platform_admins
    WHEN 'promote_admins' THEN settings.admins_can_promote_admins
    WHEN 'manage_updates' THEN settings.admins_can_manage_updates
    ELSE FALSE
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_platform_role(target_id UUID, target_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_target_role TEXT;
BEGIN
  IF target_role NOT IN ('user', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Invalid platform role.';
  END IF;

  SELECT role INTO current_target_role FROM public.profiles WHERE id = target_id;
  IF current_target_role IS NULL THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF target_role = 'owner' OR current_target_role = 'owner' THEN
    IF NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'Only platform owners can assign or remove platform owners.';
    END IF;
  ELSIF target_role = 'admin' AND NOT public.can_platform_admin('promote_admins') THEN
    RAISE EXCEPTION 'You do not have permission to assign platform admins.';
  ELSIF current_target_role = 'admin' AND target_role = 'user' AND NOT public.can_platform_admin('delete_platform_admins') THEN
    RAISE EXCEPTION 'You do not have permission to remove platform admins.';
  END IF;

  UPDATE public.profiles SET role = target_role WHERE id = target_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.moderate_user(
  target_id UUID,
  action_type TEXT,
  reason_text TEXT,
  expiry TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_role TEXT;
BEGIN
  IF NOT public.can_platform_admin('ban_users') THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;

  SELECT role INTO target_role FROM public.profiles WHERE id = target_id;
  IF target_role IN ('admin', 'owner') AND NOT public.can_platform_admin('delete_platform_admins') THEN
    RAISE EXCEPTION 'You do not have permission to moderate platform staff.';
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
  ELSE
    RAISE EXCEPTION 'Invalid moderation action.';
  END IF;

  PERFORM public.send_system_notification(
    target_id,
    'Account Update',
    'Your account status has been updated: ' || action_type || '. Reason: ' || COALESCE(reason_text, ''),
    'moderation'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_reports_with_emails()
RETURNS TABLE (
  report_id UUID,
  reporter_username TEXT,
  reporter_email TEXT,
  report_type TEXT,
  report_content TEXT,
  target_message_id UUID,
  status TEXT,
  created_at TIMESTAMPTZ,
  chat_id UUID,
  context_messages JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    p.username,
    u.email::TEXT,
    r.type,
    r.content,
    r.target_message_id,
    r.status,
    r.created_at,
    rc.chat_id,
    rc.context_messages
  FROM public.reports r
  LEFT JOIN public.profiles p ON r.reporter_id = p.id
  LEFT JOIN auth.users u ON r.reporter_id = u.id
  LEFT JOIN public.report_context rc ON r.id = rc.report_id
  ORDER BY r.created_at DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.create_group_chat(TEXT, BOOLEAN, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_group_chat(
  chat_name TEXT,
  chat_description TEXT DEFAULT NULL,
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

  INSERT INTO public.chats (name, description, is_group, is_discoverable, created_by, image_url, banner_url)
  VALUES (
    trim(chat_name),
    NULLIF(trim(COALESCE(chat_description, '')), ''),
    TRUE,
    make_discoverable,
    auth.uid(),
    NULLIF(trim(COALESCE(chat_image_url, '')), ''),
    NULLIF(trim(COALESCE(chat_banner_url, '')), '')
  )
  RETURNING id INTO new_chat_id;

  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES (new_chat_id, auth.uid(), 'owner')
  ON CONFLICT (chat_id, user_id) DO UPDATE SET role = 'owner';

  RETURN new_chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_parent_login(child_email TEXT, guardian_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  child_id UUID;
BEGIN
  SELECT u.id INTO child_id
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) = lower(trim(child_email))
    AND lower(COALESCE(p.parent_email, '')) = lower(trim(guardian_email))
    AND COALESCE(p.age, 99) < 13
  LIMIT 1;

  IF child_id IS NULL THEN
    RAISE EXCEPTION 'No matching child account found for that parent email.';
  END IF;

  UPDATE public.profiles
  SET parent_approved = TRUE
  WHERE id = child_id;
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
    RAISE EXCEPTION 'This invite is invalid or expired.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.chats c
    WHERE c.id = target_chat_id AND c.require_join_approval = TRUE
  ) THEN
    RAISE EXCEPTION 'This room requires owner approval before joining.';
  END IF;

  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES (target_chat_id, auth.uid(), 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_platform_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_parent_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_chat(TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
