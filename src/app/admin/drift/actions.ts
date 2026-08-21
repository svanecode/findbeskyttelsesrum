"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireModerator } from "@/lib/moderation/auth";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function rollbackPublicationAction(formData: FormData) {
  const { profile, supabase } = await requireModerator(true);
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

  const { error } = await supabase.schema("app_v2").rpc("rollback_dataset_publication_v1", {
    p_publication_id: publicationId,
  });

  if (error) {
    console.error("[operations] Dataset rollback failed:", { code: error.code });
    redirect("/admin/drift?error=rollback_failed");
  }

  revalidatePath("/admin/drift");
  revalidatePath("/kort");
  revalidatePath("/kommune");
  revalidatePath("/om-data");
  redirect("/admin/drift?restored=1");
}
