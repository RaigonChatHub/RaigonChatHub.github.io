-- Advanced Member Management & Username Invites
CREATE OR REPLACE FUNCTION public.manage_chat_member(
  target_chat_id UUID,
  target_user_id UUID,
  action_type TEXT -- 'promote', 'demote', 'kick', 'ban', 'mute'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_chat(target_chat_id) THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;

  IF action_type = 'promote' THEN
    UPDATE public.chat_members SET role = 'admin' WHERE chat_id = target_chat_id AND user_id = target_user_id;
  ELSIF action_type = 'demote' THEN
    UPDATE public.chat_members SET role = 'member' WHERE chat_id = target_chat_id AND user_id = target_user_id;
  ELSIF action_type = 'kick' THEN
    DELETE FROM public.chat_members WHERE chat_id = target_chat_id AND user_id = target_user_id;
  ELSIF action_type = 'ban' THEN
    UPDATE public.chat_members SET banned = TRUE WHERE chat_id = target_chat_id AND user_id = target_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_to_chat_by_username(
  target_chat_id UUID,
  target_username TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_uid UUID;
BEGIN
  IF NOT public.can_manage_chat(target_chat_id) THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;

  SELECT id INTO target_uid FROM public.profiles WHERE username = target_username;
  
  IF target_uid IS NULL THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES (target_chat_id, target_uid, 'member')
  ON CONFLICT DO NOTHING;
END;
$$;
