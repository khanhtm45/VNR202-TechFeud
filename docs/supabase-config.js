// VNR202 Supabase client configuration. Public publishable key, never a DB password.
// Access is limited by Row Level Security and authenticated RPC checks.
export const supabaseConfig = {
  url: "https://rkqxbfhgkqumtldosiae.supabase.co",
  anonKey: "sb_publishable_LgFd_X00YBIg-Kjxwb3upQ_stmGo3N7"
};
export const isSupabaseConfigured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseConfig.url)
  && supabaseConfig.anonKey.length > 15;
