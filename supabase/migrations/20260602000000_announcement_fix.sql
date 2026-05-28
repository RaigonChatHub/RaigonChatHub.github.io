-- Ensure all necessary columns and functions for announcements exist and are robust
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS announcement TEXT,
  ADD COLUMN IF NOT EXISTS announcement_updated_at TIMESTAMPTZ;

-- Drop and recreate can_manage_chat to ensure it handles all cases (Admin, Owner, Chat Admin)
CREATE OR REPLACE FUNCTION public.can_manage_chat(target_chat_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.chats WHERE id = target_chat_id AND created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.chat_members 
    WHERE chat_id = target_chat_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
END;
$$;

-- Drop and recreate clear_chat_announcement with the refined check
CREATE OR REPLACE FUNCTION public.clear_chat_announcement(target_chat_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_chat(target_chat_id) THEN
    RAISE EXCEPTION 'Identity check failed: Unauthorized management request.';
  END IF;

  UPDATE public.chats
  SET announcement = NULL, announcement_updated_at = NOW()
  WHERE id = target_chat_id;
END;
$$;
