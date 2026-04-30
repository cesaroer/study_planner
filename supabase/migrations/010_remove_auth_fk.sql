-- Remove FK dependency on Supabase auth.users so profiles can be managed independently
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
