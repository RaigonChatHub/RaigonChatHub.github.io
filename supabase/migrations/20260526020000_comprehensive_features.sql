-- 1. Bot Creation Requests Table
CREATE TABLE IF NOT EXISTS public.bot_creation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bot_creation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own bot requests." ON public.bot_creation_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can submit bot requests." ON public.bot_creation_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view and manage all bot requests." ON public.bot_creation_requests
  FOR ALL USING (public.is_admin());

-- 2. Bots Table
CREATE TABLE IF NOT EXISTS public.bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view bots." ON public.bots
  FOR SELECT USING (TRUE);

CREATE POLICY "Users can manage their own bots." ON public.bots
  FOR ALL USING (auth.uid() = owner_id);

-- 3. Reports Table
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL, -- 'bug', 'message'
  content TEXT NOT NULL,
  target_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'resolved', 'dismissed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can submit reports." ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Admins can view and manage reports." ON public.reports
  FOR ALL USING (public.is_admin());

-- 4. RPC: Request Bot Creation Access
CREATE OR REPLACE FUNCTION public.request_bot_creation_access(reason_text TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.bot_creation_requests (user_id, reason)
  VALUES (auth.uid(), reason_text);
END;
$$;

-- 5. RPC: Handle Bot Creation Request
CREATE OR REPLACE FUNCTION public.handle_bot_creation_request(request_id UUID, new_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;

  UPDATE public.bot_creation_requests
  SET status = new_status
  WHERE id = request_id
  RETURNING user_id INTO target_user_id;

  IF new_status = 'approved' THEN
    UPDATE public.profiles
    SET can_create_bots = TRUE
    WHERE id = target_user_id;
  END IF;
END;
$$;

-- 6. RPC: Submit Report
CREATE OR REPLACE FUNCTION public.submit_report(report_type TEXT, report_content TEXT, target_message_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.reports (reporter_id, type, content, target_message_id)
  VALUES (auth.uid(), report_type, report_content, target_message_id);
END;
$$;
