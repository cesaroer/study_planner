import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

const createOfflineAuthStub = () => ({
  getSession: async () => ({ data: { session: null }, error: null }),
  refreshSession: async () => ({ data: { session: null }, error: null }),
  signInWithPassword: async () => ({ data: { session: null, user: null }, error: new Error('network unavailable: supabase not configured') }),
  signUp: async () => ({ data: { session: null, user: null }, error: new Error('network unavailable: supabase not configured') }),
  signOut: async () => ({ error: null })
});

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : {
      auth: createOfflineAuthStub()
    };

if (!hasSupabaseConfig && typeof console !== 'undefined') {
  console.info(
    '[Study Planner] Supabase no configurado. Se ejecuta en modo local-first sin sesión remota.'
  );
}

export default supabase;
