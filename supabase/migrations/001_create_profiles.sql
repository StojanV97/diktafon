-- Profiles table: subscription management and usage tracking
-- No journal data stored in Supabase — all data lives in iCloud + local storage

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_tier TEXT NOT NULL DEFAULT 'free',
  transcription_minutes_used INTEGER NOT NULL DEFAULT 0,
  billing_cycle_start TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security: users can only access their own profile
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage bucket for temporary audio uploads (used by transcription proxy)
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-uploads', 'audio-uploads', false);

-- Storage policy: authenticated users can upload to their own folder
CREATE POLICY "Users can upload own audio"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'audio-uploads' AND
    auth.uid()::text = (storage.foldername(name))[2]
  );

CREATE POLICY "Users can read own audio"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'audio-uploads' AND
    auth.uid()::text = (storage.foldername(name))[2]
  );
