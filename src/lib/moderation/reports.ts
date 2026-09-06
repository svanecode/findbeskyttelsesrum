import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { moderationPageSize, parseModerationQueuePage, type ModerationQueuePage } from "@/lib/moderation/pagination";

export const reportStatuses = ["open", "reviewing", "resolved", "rejected"] as const;
export type ReportStatus = (typeof reportStatuses)[number];

export type ModerationReport = {
  id: string;
  status: ReportStatus;
  type: string;
  message: string;
  contactEmail: string | null;
  createdAt: string;
  updatedAt: string;
  resolutionNote: string | null;
  resolutionOutcome: string | null;
  reviewedAt: string | null;
  shelter: {
    id: string;
    slug: string;
    addressLine1: string;
    postalCode: string;
    city: string;
    capacity: number;
    publicationState: string;
    municipalityName: string;
  };
};

type ModerationReportRow = {
  report_id: string;
  report_status: ReportStatus;
  report_type: string;
  report_message: string;
  contact_email: string | null;
  report_created_at: string;
  report_updated_at: string;
  resolution_note: string | null;
  resolution_outcome: string | null;
  reviewed_at: string | null;
  shelter_id: string;
  shelter_slug: string;
  address_line1: string;
  postal_code: string;
  city: string;
  capacity: number | string;
  publication_state: string;
  municipality_name: string;
};

export async function getModerationReports(
  supabase: SupabaseClient,
  status?: ReportStatus,
  page = 1,
): Promise<ModerationQueuePage<ModerationReport, ReportStatus>> {
  const { data, error } = await supabase.schema("app_v2").rpc("list_shelter_reports_for_moderation_v2", {
    p_status: status ?? null,
    p_limit: moderationPageSize,
    p_page: page,
  });

  if (error) {
    console.error("[moderation] Could not load queue:", { code: error.code });
    throw new Error("Moderationskøen kunne ikke indlæses.");
  }

  const result = parseModerationQueuePage<ModerationReportRow, ReportStatus>(data, reportStatuses);
  return { ...result, rows: result.rows.map((row) => ({
    id: row.report_id,
    status: row.report_status,
    type: row.report_type,
    message: row.report_message,
    contactEmail: row.contact_email,
    createdAt: row.report_created_at,
    updatedAt: row.report_updated_at,
    resolutionNote: row.resolution_note,
    resolutionOutcome: row.resolution_outcome,
    reviewedAt: row.reviewed_at,
    shelter: {
      id: row.shelter_id,
      slug: row.shelter_slug,
      addressLine1: row.address_line1,
      postalCode: row.postal_code,
      city: row.city,
      capacity: Number(row.capacity),
      publicationState: row.publication_state,
      municipalityName: row.municipality_name,
    },
  })) };
}
