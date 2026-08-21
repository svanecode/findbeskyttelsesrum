import { createClient } from "@supabase/supabase-js";

import { withAppV2Schema } from "@/lib/supabase/app-v2";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Read-only PostgREST client for public app_v2 data (anon key).
 * Queries must use *_public views only — base tables are not granted to anon.
 */
export function createAppV2PublicClient() {
  const { url, publishableKey } = getSupabasePublicEnv();

  return withAppV2Schema(
    createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  );
}
