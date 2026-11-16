import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Service-role client for server-side writes. Bypasses RLS, so it must never reach the browser. */
export function getAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
