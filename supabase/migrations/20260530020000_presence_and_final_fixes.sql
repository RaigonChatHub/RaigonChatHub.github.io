-- 1. Ensure 'status' exists on profiles for automatic presence
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'online';

-- 2. Ensure 'parent_approved' exists for age verification
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS parent_approved BOOLEAN DEFAULT TRUE;

-- 3. Ensure 'date_of_birth' exists
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;
