// Public build-time settings. The Supabase URL and anon (publishable) key are
// designed to be public; access is enforced by row level security on the server.
// Values come from .env files at build time (see .env.example), never from source.

export const appParams = {
  appId: import.meta.env.VITE_APP_ID || 'coinexa',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  // Kept for code that still reads it; sessions are managed by supabase-js.
  token: null,
};

if (!appParams.supabaseUrl || !appParams.supabaseAnonKey) {
  console.error('Coinexa: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set for this build.');
}
