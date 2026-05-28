-- Repair Migration to add missing columns used by the restored code
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS bot_name TEXT,
  ADD COLUMN IF NOT EXISTS is_broadcast BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reactions." ON public.message_reactions
  FOR SELECT USING (TRUE);

CREATE POLICY "Users can manage their own reactions." ON public.message_reactions
  FOR ALL USING (auth.uid() = user_id);

-- Ensure profiles has last_seen_version for the update log logic
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_version TEXT DEFAULT '0.0.0',
  ADD COLUMN IF NOT EXISTS can_create_bots BOOLEAN DEFAULT FALSE;
