import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (!hasSupabase) return null;
  if (!client) client = createClient(SUPABASE_URL!, SUPABASE_KEY!);
  return client;
}

/** Write a row from the browser. Returns where it went so the UI can say so honestly. */
export async function writeRow(
  table: string,
  row: Record<string, unknown>,
  persist = true,
): Promise<{ ok: boolean; where: "supabase" | "local"; error?: string }> {
  const sb = persist ? getSupabase() : null;
  if (!sb) return { ok: true, where: "local" };
  const { error } = await sb.from(table).insert(row);
  if (error) return { ok: false, where: "supabase", error: error.message };
  return { ok: true, where: "supabase" };
}
