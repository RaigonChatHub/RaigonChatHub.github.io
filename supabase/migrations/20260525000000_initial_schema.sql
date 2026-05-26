-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  age INTEGER,
  parent_email TEXT,
  parent_approved BOOLEAN DEFAULT FALSE,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Chats Table
CREATE TABLE IF NOT EXISTS public.chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  is_group BOOLEAN DEFAULT FALSE,
  is_discoverable BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id),
  last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Chat Members Table
CREATE TABLE IF NOT EXISTS public.chat_members (
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (chat_id, user_id)
);

-- 4. Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile." ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Chats Policies
CREATE POLICY "Users can view chats they are members of." ON public.chats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_members
      WHERE chat_id = public.chats.id AND user_id = auth.uid()
    ) OR is_discoverable = true
  );

CREATE POLICY "Authenticated users can create chats." ON public.chats
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Chat Members Policies
CREATE POLICY "Members can view other members of their chats." ON public.chat_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_members AS my_membership
      WHERE my_membership.chat_id = public.chat_members.chat_id AND my_membership.user_id = auth.uid()
    )
  );

-- Messages Policies
CREATE POLICY "Members can view messages in their chats." ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_members
      WHERE chat_id = public.messages.chat_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert messages in their chats." ON public.messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_members
      WHERE chat_id = public.messages.chat_id AND user_id = auth.uid()
    )
  );

-- 5. Seed Admin Account
-- This inserts the Admin into Supabase's internal auth table
-- Email: admin@raigon.com, Password: zo@873387DNH
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  'authenticated',
  'authenticated',
  'admin@raigon.com',
  crypt('zo@873387DNH', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"user_name": "Admin", "full_name": "Max"}',
  now(),
  now(),
  '',
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- Ensure the profile is created even if the trigger hasn't fired yet
INSERT INTO public.profiles (id, username, display_name, role)
VALUES (
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  'Admin',
  'Max',
  'admin'
) ON CONFLICT (id) DO NOTHING;

-- 6. Trigger for Google Auth / Sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, role, age, parent_email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'user_name', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'user_name'),
    CASE WHEN (NEW.raw_user_meta_data->>'user_name' = 'Admin') THEN 'admin' ELSE 'user' END,
    (NEW.raw_user_meta_data->>'age')::INTEGER,
    NEW.raw_user_meta_data->>'parent_email'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Automated Storage & Lifecycle Management

-- Message Pruning: Delete old messages if we hit a threshold (e.g., 100k messages)
CREATE OR REPLACE FUNCTION public.prune_messages()
RETURNS TRIGGER AS $$
DECLARE
  msg_count INTEGER;
BEGIN
  SELECT count(*) INTO msg_count FROM public.messages;
  IF msg_count > 100000 THEN
    DELETE FROM public.messages
    WHERE id IN (
      SELECT id FROM public.messages
      ORDER BY created_at ASC
      LIMIT 1000
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_prune_messages
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.prune_messages();

-- Inactive Chat Cleanup
-- This would typically be a cron job (pg_net or pg_cron in Supabase)
-- For the purpose of this script, we'll define the function.

CREATE OR REPLACE FUNCTION public.cleanup_inactive_chats()
RETURNS void AS $$
BEGIN
  -- 1. Flag inactive: Handled by checking last_activity_at > 90 days
  -- 2. Delete chats with no activity for 120 days (90 + 30 grace)
  DELETE FROM public.chats
  WHERE last_activity_at < NOW() - INTERVAL '120 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update last_activity_at on new message
CREATE OR REPLACE FUNCTION public.update_chat_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chats
  SET last_activity_at = NOW()
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_chat_activity
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_chat_last_activity();
