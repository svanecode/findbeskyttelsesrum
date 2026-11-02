"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireModerator } from "@/lib/moderation/auth";
import { revalidatePublicData } from "@/lib/moderation/revalidate-public-data";
import { createAppV2AdminClient } from "@/lib/supabase/app-v2";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function rollbackPublicationAction(formData: FormData) {
  const { profile } = await requireModerator(true);
  const publicationId = formData.get("publicationId");
  const confirmation = formData.get("confirmation");

  if (
    profile.role !== "owner" ||
    typeof publicationId !== "string" ||
    !uuidPattern.test(publicationId) ||
    confirmation !== "GENDAN"
  ) {
    redirect("/admin/drift?error=invalid_rollback");
  }

  // The signed-in session stops statements after 8 seconds, and a function's
  // own timeout cannot extend that. Owner and aal2 are checked above, so the
  // rollback runs with the service role; the database still checks the actor.
  const { error } = await createAppV2AdminClient().schema("app_v2").rpc("rollback_dataset_publication_as_owner_v1", {
    p_publication_id: publicationId,
    p_actor_account_id: profile.moderatorId,
  });

  if (error) {
    console.error("[operations] Dataset rollback failed:", { code: error.code });
    redirect("/admin/drift?error=rollback_failed");
  }

  revalidatePath("/admin/drift");
  revalidatePublicData();
  redirect("/admin/drift?restored=1");
}
