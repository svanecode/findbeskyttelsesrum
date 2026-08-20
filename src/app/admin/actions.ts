"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireModerator } from "@/lib/moderation/auth";

const reportIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function moderateReportAction(formData: FormData) {
  const reportId = optionalText(formData, "reportId");
  const action = optionalText(formData, "action");
  if (!reportId || !reportIdPattern.test(reportId) || !action) redirect("/admin?error=invalid_action");

  const { supabase } = await requireModerator(true);
  const rawCapacity = optionalText(formData, "capacity");
  const capacity = rawCapacity && /^\d+$/.test(rawCapacity) ? Number(rawCapacity) : null;
  const { error } = await supabase.schema("app_v2").rpc("moderate_shelter_report_v1", {
    p_report_id: reportId,
    p_action: action,
    p_note: optionalText(formData, "note"),
    p_address_line1: optionalText(formData, "addressLine1"),
    p_postal_code: optionalText(formData, "postalCode"),
    p_city: optionalText(formData, "city"),
    p_capacity: capacity,
  });

  if (error) {
    console.error("[moderation] Action failed:", { code: error.code, action });
    redirect("/admin?error=moderation_failed");
  }

  revalidatePath("/admin");
  revalidatePath("/kort");
  revalidatePath("/om-data");
  redirect("/admin?updated=1");
}

export async function signOutModeratorAction() {
  const session = await requireModerator(false);
  await session.supabase.auth.signOut();
  redirect("/admin/login");
}
