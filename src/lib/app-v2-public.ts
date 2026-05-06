import { createClient } from "@supabase/supabase-js";

import { withAppV2Schema } from "@/lib/supabase/app-v2";

/**
 * Read-only PostgREST client for public app_v2 data (anon key).
 * Queries must use *_public views only — base tables are not granted to anon.
 */
export function createAppV2PublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY for public app_v2 reads.",
    );
  }

  return withAppV2Schema(
    createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  );
}
