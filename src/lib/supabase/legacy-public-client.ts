import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

/** Public-schema reads (anvendelseskoder, kommunekoder) using the anon key. */
let legacyClient: SupabaseClient | null = null;

export function getLegacyPublicSupabase(): SupabaseClient {
  if (legacyClient) return legacyClient;

  const { url, publishableKey } = getSupabasePublicEnv();

  legacyClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return legacyClient;
}
