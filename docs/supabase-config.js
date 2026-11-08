/**
 * Supabase dashboard -> Project Settings -> Data API (Project URL)
 * and API Keys -> publishable key (sb_publishable_...) or legacy anon key.
 * Both are PUBLIC CLIENT SETTINGS; do not put secret/service_role keys here.
 */
export const supabaseConfig = {
  url: "",
  anonKey: ""
};
export const isSupabaseConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseConfig.url) &&
  supabaseConfig.anonKey.length > 15;
