-- supabase_account_linking.sql

-- 1. Create the new 'profiles' table to store unified user data.
-- This table will use the email address as the unique key to link multiple social logins.
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Unified user profiles, linked by email address across different auth providers.';
COMMENT ON COLUMN public.profiles.id IS 'Primary key for the application user.';
COMMENT ON COLUMN public.profiles.email IS 'Unique email address, used to link identities.';
COMMENT ON COLUMN public.profiles.name IS 'Display name of the user.';
COMMENT ON COLUMN public.profiles.avatar_url IS 'URL for the user''s profile picture.';


-- 2. Create a function to automatically update the 'updated_at' timestamp.
CREATE OR REPLACE FUNCTION public.handle_profile_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- 3. Create a trigger to execute the function whenever a profile is updated.
CREATE TRIGGER on_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_profile_update_timestamp();


-- 4. Enable Row Level Security (RLS) on the 'profiles' table.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- 5. Create RLS policies for the 'profiles' table.
-- These policies will be bypassed by server-side operations using the service_role key.
-- They are primarily for governing client-side access.

-- POLICY: Allow anyone to view any profile.
-- This is necessary to display author names and avatars on public content like posts.
CREATE POLICY "Profiles are viewable by everyone."
  ON public.profiles FOR SELECT
  USING ( true );

-- POLICY: Allow logged-in users to update their own profile.
-- It matches the user's email from their JWT with the email in the profile table.
CREATE POLICY "Users can update their own profile."
  ON public.profiles FOR UPDATE
  USING ( auth.jwt()->>'email' = email )
  WITH CHECK ( auth.jwt()->>'email' = email );

-- Note: INSERT operations will be handled by the server-side auth callback using the
-- service_role key, so no RLS policy for INSERT is needed for client-side users.
-- Deletion of profiles should be handled with care, likely only by admins,
-- so no DELETE policy is created for general users.

-- Example of how to seed this table from existing auth users (run once manually if needed)
/*
INSERT INTO public.profiles (id, email, name, avatar_url)
SELECT
    id,
    email,
    raw_user_meta_data->>'full_name' AS name,
    raw_user_meta_data->>'avatar_url' AS avatar_url
FROM auth.users
ON CONFLICT (email) DO NOTHING;
*/
