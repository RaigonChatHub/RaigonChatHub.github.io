-- 1. Create Storage Bucket for Attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage Policies
CREATE POLICY "Attachments are publicly accessible." ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-attachments');

CREATE POLICY "Authenticated users can upload attachments." ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'chat-attachments' AND 
    auth.role() = 'authenticated'
  );

CREATE POLICY "Users can delete their own attachments." ON storage.objects
  FOR DELETE USING (
    bucket_id = 'chat-attachments' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Ensure all permission columns exist on chats
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS managers_can_remove_members BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS managers_can_timeout_members BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS managers_can_ban_members BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS members_can_remove_members BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS members_can_ban_members BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bots_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS enabled_bots TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_blocked_words TEXT[] DEFAULT '{}';
