import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ImportPublication = {
  id: string;
  isCurrent: boolean;
  snapshotAvailable: boolean;
  recordCount: number;
  totalCapacity: number;
  coordinateCount: number;
  municipalityCount: number;
  publishedAt: string;
  publishedByType: "migration" | "importer" | "moderator_rollback";
  rollbackOfPublicationId: string | null;
  qualityMetrics: Record<string, unknown>;
};

export type ImportRun = {
  id: string;
  status: "running" | "succeeded" | "failed";
  publicationStatus: "legacy" | "staging" | "published" | "rejected" | "not_published";
  recordsSeen: number;
  recordsStaged: number;
  pagesFetched: number;
  startedAt: string;
  finishedAt: string | null;
  qualityGatePassed: boolean | null;
  qualityGateReasons: string[];
  qualityMetrics: Record<string, unknown>;
  errorSummary: string | null;
};

export type ImportOperations = {
  moderatorRole: "moderator" | "owner";
  currentPublication: Omit<ImportPublication, "isCurrent" | "snapshotAvailable" | "rollbackOfPublicationId"> | null;
  publications: ImportPublication[];
  runs: ImportRun[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricsValue(value: unknown) {
  return isObject(value) ? value : {};
}

function publicationValue(value: unknown): ImportPublication | null {
  if (!isObject(value) || !stringValue(value.id)) return null;
  const publishedByType = stringValue(value.publishedByType);
  if (!["migration", "importer", "moderator_rollback"].includes(publishedByType)) return null;

  return {
    id: stringValue(value.id),
    isCurrent: value.isCurrent === true,
    snapshotAvailable: value.snapshotAvailable === true,
    recordCount: numberValue(value.recordCount),
    totalCapacity: numberValue(value.totalCapacity),
    coordinateCount: numberValue(value.coordinateCount),
    municipalityCount: numberValue(value.municipalityCount),
    publishedAt: stringValue(value.publishedAt),
    publishedByType: publishedByType as ImportPublication["publishedByType"],
    rollbackOfPublicationId: stringValue(value.rollbackOfPublicationId) || null,
    qualityMetrics: metricsValue(value.qualityMetrics),
  };
}

function runValue(value: unknown): ImportRun | null {
  if (!isObject(value) || !stringValue(value.id)) return null;
  const status = stringValue(value.status);
  const publicationStatus = stringValue(value.publicationStatus, "legacy");
  if (!["running", "succeeded", "failed"].includes(status)) return null;
  if (!["legacy", "staging", "published", "rejected", "not_published"].includes(publicationStatus)) return null;

  return {
    id: stringValue(value.id),
    status: status as ImportRun["status"],
    publicationStatus: publicationStatus as ImportRun["publicationStatus"],
    recordsSeen: numberValue(value.recordsSeen),
    recordsStaged: numberValue(value.recordsStaged),
    pagesFetched: numberValue(value.pagesFetched),
    startedAt: stringValue(value.startedAt),
    finishedAt: stringValue(value.finishedAt) || null,
    qualityGatePassed: typeof value.qualityGatePassed === "boolean" ? value.qualityGatePassed : null,
    qualityGateReasons: Array.isArray(value.qualityGateReasons)
      ? value.qualityGateReasons.map(String)
      : [],
    qualityMetrics: metricsValue(value.qualityMetrics),
    errorSummary: stringValue(value.errorSummary) || null,
  };
}

export async function getImportOperations(supabase: SupabaseClient): Promise<ImportOperations> {
  const { data, error } = await supabase.schema("app_v2").rpc("get_import_operations_v1");

  if (error || !isObject(data)) {
    console.error("[operations] Could not load import operations:", { code: error?.code });
    throw new Error("Driftsoverblikket kunne ikke indlæses.");
  }

  const moderatorRole = data.moderatorRole === "owner" ? "owner" : "moderator";
  const current = publicationValue(data.currentPublication);

  return {
    moderatorRole,
    currentPublication: current
      ? {
          id: current.id,
          recordCount: current.recordCount,
          totalCapacity: current.totalCapacity,
          coordinateCount: current.coordinateCount,
          municipalityCount: current.municipalityCount,
          publishedAt: current.publishedAt,
          publishedByType: current.publishedByType,
          qualityMetrics: current.qualityMetrics,
        }
      : null,
    publications: Array.isArray(data.publications)
      ? data.publications.map(publicationValue).filter((item): item is ImportPublication => item !== null)
      : [],
    runs: Array.isArray(data.runs)
      ? data.runs.map(runValue).filter((item): item is ImportRun => item !== null)
      : [],
  };
}
