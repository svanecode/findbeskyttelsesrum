import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ModeratorProfile = {
  moderatorId: string;
  providerLogin: string;
  role: "moderator" | "owner";
  assuranceLevel: "aal1" | "aal2";
};

type ModeratorProfileRow = {
  moderator_id: string;
  provider_login: string;
  moderator_role: "moderator" | "owner";
  assurance_level: "aal1" | "aal2";
};

export type ModeratorSession = {
  supabase: SupabaseClient;
  user: User;
  profile: ModeratorProfile | null;
};

export async function getOptionalModeratorSession(): Promise<ModeratorSession | null> {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) return null;

  const { data, error } = await supabase
    .schema("app_v2")
    .rpc("get_current_moderator_profile_v1")
    .maybeSingle();

  if (error || !data) {
    return { supabase, user: userData.user, profile: null };
  }

  const row = data as ModeratorProfileRow;
  return {
    supabase,
    user: userData.user,
    profile: {
      moderatorId: row.moderator_id,
      providerLogin: row.provider_login,
      role: row.moderator_role,
      assuranceLevel: row.assurance_level,
    },
  };
}

export async function requireModerator(requireMfa = true): Promise<ModeratorSession & { profile: ModeratorProfile }> {
  const session = await getOptionalModeratorSession();

  if (!session) redirect("/admin/login");
  if (!session.profile) redirect("/admin/login?error=not_authorized");
  if (requireMfa && session.profile.assuranceLevel !== "aal2") redirect("/admin/mfa");

  return session as ModeratorSession & { profile: ModeratorProfile };
}
