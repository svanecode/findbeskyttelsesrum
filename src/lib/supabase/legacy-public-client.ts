import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Public-schema reads (anvendelseskoder, kommunekoder) using the anon key. */
let legacyClient: SupabaseClient | null = null;

export function getLegacyPublicSupabase(): SupabaseClient {
  if (legacyClient) return legacyClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for legacy public reads.");
  }

  legacyClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return legacyClient;
}
