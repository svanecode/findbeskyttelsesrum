import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  privacyContactStatuses,
  type PrivacyContactCategory,
  type PrivacyContactMessage,
  type PrivacyContactStatus,
} from "@/lib/contact/privacy-contact";

export { privacyContactStatuses };

export type ModerationPrivacyContactCase = {
  id: string;
  reference: string;
  category: PrivacyContactCategory;
  subject: string;
  status: PrivacyContactStatus;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  responseDueAt: string;
  retentionUntil: string;
  isOverdue: boolean;
  messages: PrivacyContactMessage[];
};

type ModerationPrivacyContactCaseRow = {
  case_id: string;
  case_reference: string;
  case_category: PrivacyContactCategory;
  case_subject: string;
  case_status: PrivacyContactStatus;
  case_created_at: string;
  case_updated_at: string;
  last_activity_at: string;
  response_due_at: string;
  retention_until: string;
  messages: PrivacyContactMessage[] | null;
};

export async function getModerationPrivacyContactCases(
  supabase: SupabaseClient,
  status?: PrivacyContactStatus,
): Promise<ModerationPrivacyContactCase[]> {
  const { data, error } = await supabase.schema("app_v2").rpc("list_privacy_contact_cases_for_moderation_v1", {
    p_status: status ?? null,
    p_limit: 250,
  });

  if (error) {
    console.error("[privacy-contact] Could not load moderation queue:", { code: error.code });
    throw new Error("Kontaktkøen kunne ikke indlæses.");
  }

  return ((data ?? []) as ModerationPrivacyContactCaseRow[]).map((row) => ({
    id: row.case_id,
    reference: row.case_reference,
    category: row.case_category,
    subject: row.case_subject,
    status: row.case_status,
    createdAt: row.case_created_at,
    updatedAt: row.case_updated_at,
    lastActivityAt: row.last_activity_at,
    responseDueAt: row.response_due_at,
    retentionUntil: row.retention_until,
    isOverdue: row.case_status !== "closed" && new Date(row.response_due_at).getTime() < Date.now(),
    messages: Array.isArray(row.messages) ? row.messages : [],
  }));
}
