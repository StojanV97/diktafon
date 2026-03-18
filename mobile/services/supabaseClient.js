import AsyncStorage from "@react-native-async-storage/async-storage"
import { createClient } from "@supabase/supabase-js"

// TODO: Replace with your Supabase project URL and anon key
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
