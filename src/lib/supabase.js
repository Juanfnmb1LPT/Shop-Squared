import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ewfruakstslftslhcmsc.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Implicit flow (tokens in the URL hash) is required for invites issued
        // from the Supabase dashboard: those have no client-side PKCE verifier.
        // We parse and clear the hash ourselves in auth.js, so leave
        // detectSessionInUrl off to avoid it racing with the hash router.
        flowType: 'implicit',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;