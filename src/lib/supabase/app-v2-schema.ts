import type { SupabaseClient } from "@supabase/supabase-js";

export const appV2Schema = "app_v2";

export function withAppV2Schema<TClient extends SupabaseClient>(client: TClient) {
  return client.schema(appV2Schema);
}
