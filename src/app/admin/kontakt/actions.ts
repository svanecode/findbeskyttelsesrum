"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireModerator } from "@/lib/moderation/auth";

const caseIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function moderatePrivacyContactAction(formData: FormData) {
  const caseId = optionalText(formData, "caseId");
  const action = optionalText(formData, "action");
  const message = optionalText(formData, "message");

  if (!caseId || !caseIdPattern.test(caseId) || !action) {
    redirect("/admin/kontakt?error=invalid_action");
  }
  if (message && message.length > 4_000) {
    redirect("/admin/kontakt?error=invalid_message");
  }

  const { supabase } = await requireModerator(true);
  const { error } = action === "delete"
    ? await supabase.schema("app_v2").rpc("delete_privacy_contact_case_v1", {
        p_case_id: caseId,
        p_confirmation: optionalText(formData, "confirmation"),
      })
    : await supabase.schema("app_v2").rpc("moderate_privacy_contact_case_v1", {
        p_case_id: caseId,
        p_action: action,
        p_message: message,
      });

  if (error) {
    console.error("[privacy-contact] Moderation action failed:", { code: error.code, action });
    redirect("/admin/kontakt?error=moderation_failed");
  }

  revalidatePath("/admin/kontakt");
  redirect("/admin/kontakt?updated=1");
}
