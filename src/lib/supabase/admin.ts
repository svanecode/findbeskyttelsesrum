import { createClient } from "@supabase/supabase-js";

import { getSupabaseWriteEnv } from "@/lib/supabase/env";

export function createSupabaseAdminClient() {
  const { url, secretKey } = getSupabaseWriteEnv();

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
