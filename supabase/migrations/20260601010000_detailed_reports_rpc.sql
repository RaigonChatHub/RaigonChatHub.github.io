-- 1. RPC: Get Reports with detailed info (emails & context)
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
  IF NOT (SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()) THEN
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
