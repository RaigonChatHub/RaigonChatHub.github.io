-- Add file attachment support to messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_type TEXT,
  ADD COLUMN IF NOT EXISTS file_size INTEGER;

-- Update bots to use schema instead of plain prompt
ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS bot_schema JSONB DEFAULT '{}'::jsonb;
