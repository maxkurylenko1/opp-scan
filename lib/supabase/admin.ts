import { createClient } from "@supabase/supabase-js";
import { config, hasSupabase } from "@/lib/config";

export function getAdminClient() {
  if (!hasSupabase) return null;
  return createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false } });
}
