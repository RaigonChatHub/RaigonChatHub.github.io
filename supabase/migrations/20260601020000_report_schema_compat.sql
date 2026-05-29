ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS target_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS reports_target_message_id_idx ON public.reports(target_message_id);
