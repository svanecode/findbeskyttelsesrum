import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withAppV2Schema } from "@/lib/supabase/app-v2-schema";

export function createAppV2AdminClient() {
  return withAppV2Schema(createSupabaseAdminClient());
}
