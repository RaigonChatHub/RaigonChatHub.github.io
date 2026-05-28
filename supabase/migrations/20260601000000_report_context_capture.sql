-- Upgrade Submit Report to capture context
CREATE OR REPLACE FUNCTION public.submit_report(
  report_type TEXT, 
  report_content TEXT, 
  target_message_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_report_id UUID;
  v_chat_id UUID;
  v_context JSONB;
BEGIN
  -- 1. Insert the report
  INSERT INTO public.reports (reporter_id, type, content, target_message_id)
  VALUES (auth.uid(), report_type, report_content, target_message_id)
  RETURNING id INTO new_report_id;

  -- 2. Capture context if it's a message report
  IF target_message_id IS NOT NULL THEN
    SELECT chat_id INTO v_chat_id FROM public.messages WHERE id = target_message_id;

    -- Aggregate 10 messages before and 10 after (ordered by created_at)
    -- We convert them to a JSON array for snapshotting
    WITH msg_context AS (
      (SELECT id, sender_id, content, created_at FROM public.messages 
       WHERE chat_id = v_chat_id AND created_at <= (SELECT created_at FROM public.messages WHERE id = target_message_id)
       ORDER BY created_at DESC LIMIT 11)
      UNION ALL
      (SELECT id, sender_id, content, created_at FROM public.messages 
       WHERE chat_id = v_chat_id AND created_at > (SELECT created_at FROM public.messages WHERE id = target_message_id)
       ORDER BY created_at ASC LIMIT 10)
    )
    SELECT jsonb_agg(msg) INTO v_context FROM (SELECT * FROM msg_context ORDER BY created_at ASC) msg;

    INSERT INTO public.report_context (report_id, chat_id, message_id, context_messages)
    VALUES (new_report_id, v_chat_id, target_message_id, v_context);
  END IF;
END;
$$;
