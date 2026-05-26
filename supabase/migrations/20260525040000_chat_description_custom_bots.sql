ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS custom_bots JSONB DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.update_chat_full_settings(
  target_chat_id UUID,
  chat_name TEXT,
  chat_description TEXT DEFAULT NULL,
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
  bot_list TEXT[] DEFAULT NULL,
  custom_bot_list JSONB DEFAULT '[]'::jsonb
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
      description = NULLIF(trim(chat_description), ''),
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
      enabled_bots = COALESCE(bot_list, c.enabled_bots),
      custom_bots = COALESCE(custom_bot_list, c.custom_bots)
  WHERE c.id = target_chat_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_chat_full_settings(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  BOOLEAN,
  TEXT[],
  BOOLEAN,
  BOOLEAN,
  BOOLEAN,
  BOOLEAN,
  BOOLEAN,
  BOOLEAN,
  TEXT[],
  JSONB
) TO authenticated;
