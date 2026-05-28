-- 1. Create a log for moderation/reports with context
CREATE TABLE IF NOT EXISTS public.report_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  context_messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Function to transfer ownership
CREATE OR REPLACE FUNCTION public.transfer_chat_ownership(
  target_chat_id UUID,
  new_owner_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_owner_id UUID;
BEGIN
  -- Get current owner
  SELECT created_by INTO old_owner_id FROM public.chats WHERE id = target_chat_id;

  -- Check if executor is current owner or platform admin
  IF old_owner_id != auth.uid() AND NOT (SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the current owner or platform admin can transfer ownership.';
  END IF;

  -- Update the chat creator
  UPDATE public.chats SET created_by = new_owner_id WHERE id = target_chat_id;

  -- Ensure new owner is a member with owner role
  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES (target_chat_id, new_owner_id, 'owner')
  ON CONFLICT (chat_id, user_id) DO UPDATE SET role = 'owner';

  -- Set old owner to platform role if transferer was owner (as per user request: "where they become a platform admin")
  IF old_owner_id = auth.uid() THEN
    UPDATE public.profiles SET role = 'admin' WHERE id = old_owner_id;
  END IF;
  
  -- Demote role in this specific chat for the old owner
  UPDATE public.chat_members SET role = 'admin' WHERE chat_id = target_chat_id AND user_id = old_owner_id;
END;
$$;

-- 3. Function to leave chat
CREATE OR REPLACE FUNCTION public.leave_chat(target_chat_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_creator BOOLEAN;
  member_count INTEGER;
BEGIN
  SELECT (created_by = auth.uid()) INTO is_creator FROM public.chats WHERE id = target_chat_id;
  SELECT count(*) INTO member_count FROM public.chat_members WHERE chat_id = target_chat_id;

  IF is_creator AND member_count > 1 THEN
    RAISE EXCEPTION 'Owners must transfer ownership before leaving if other members exist.';
  END IF;

  DELETE FROM public.chat_members WHERE chat_id = target_chat_id AND user_id = auth.uid();
END;
$$;

-- 4. Grant permissions
GRANT EXECUTE ON FUNCTION public.transfer_chat_ownership(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_chat(UUID) TO authenticated;
