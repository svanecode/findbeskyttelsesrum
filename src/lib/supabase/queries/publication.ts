import { createAppV2PublicClient } from "@/lib/app-v2-public";
import { createAppV2AdminClient } from "@/lib/supabase/app-v2";
import { isMissingPublicRpcError } from "@/lib/supabase/public-rpc-errors";
import { normalizeImportRun, normalizePublicStat } from "./shared";
import type { ImportRunRow } from "./shared";
import { getAppV2PublicDataStats } from "./stats";

type DatasetPublicationRow = {
  id: string;
  import_run_id: string | null;
  rollback_of_publication_id: string | null;
  published_at: string;
  published_by_type: "migration" | "importer" | "moderator_rollback";
  record_count: number | string;
};

type DatasetImportRunRow = {
  id: string;
  status: "running" | "succeeded" | "failed";
  publication_status: "legacy" | "staging" | "published" | "rejected" | "not_published";
  publication_id: string | null;
  finished_at: string | null;
};

export type AppV2CurrentDatasetPublication = {
  publicationId: string;
  importRunId: string | null;
  publishedAt: string;
  sourceRecordCount: number;
  publishedByType: DatasetPublicationRow["published_by_type"];
  importFinishedAt: string | null;
  isConsistent: boolean;
};

type PublicDataRevisionRow = {
  revision: number | string;
  publication_id: string | null;
  changed_at: string;
};

export type AppV2PublicDataRevision = {
  revision: string;
  publicationId: string | null;
  changedAt: string;
  cacheKey: string;
};

export async function getAppV2CurrentDatasetPublication(): Promise<AppV2CurrentDatasetPublication | null> {
  const admin = createAppV2AdminClient();
  const { data, error } = await admin
    .from("dataset_publications")
    .select(
      "id, import_run_id, rollback_of_publication_id, published_at, published_by_type, record_count",
    )
    .eq("source_name", "datafordeler-bbr-dar")
    .eq("is_current", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load current dataset publication: ${error.message}`);
  }
  if (!data) return null;

  const publication = data as DatasetPublicationRow;
  let importRunId = publication.import_run_id;
  if (!importRunId && publication.rollback_of_publication_id) {
    const { data: rollbackSource, error: rollbackError } = await admin
      .from("dataset_publications")
      .select("import_run_id")
      .eq("id", publication.rollback_of_publication_id)
      .limit(1)
      .maybeSingle();
    if (rollbackError) {
      throw new Error(`Could not load rollback source publication: ${rollbackError.message}`);
    }
    importRunId = (rollbackSource as { import_run_id: string | null } | null)?.import_run_id ?? null;
  }

  let importRun: DatasetImportRunRow | null = null;
  if (importRunId) {
    const { data: runData, error: runError } = await admin
      .from("import_runs")
      .select("id, status, publication_status, publication_id, finished_at")
      .eq("id", importRunId)
      .limit(1)
      .maybeSingle();
    if (runError) {
      throw new Error(`Could not load publication import run: ${runError.message}`);
    }
    importRun = runData as DatasetImportRunRow | null;
  }

  const publicationLinkIsValid = publication.published_by_type === "migration"
    || publication.published_by_type === "moderator_rollback"
    || importRun?.publication_id === publication.id;

  return {
    publicationId: publication.id,
    importRunId,
    publishedAt: publication.published_at,
    sourceRecordCount: normalizePublicStat(publication.record_count),
    publishedByType: publication.published_by_type,
    importFinishedAt: importRun?.finished_at ?? null,
    isConsistent: Boolean(
      importRun
      && importRun.id === importRunId
      && importRun.status === "succeeded"
      && publicationLinkIsValid,
    ),
  };
}

export async function getAppV2PublicDataRevision(): Promise<AppV2PublicDataRevision> {
  const publicClient = createAppV2PublicClient();
  const { data, error } = await publicClient
    .rpc("get_public_data_revision_v1")
    .single();

  if (error) {
    if (!isMissingPublicRpcError(error)) {
      throw new Error(`Could not load the public data revision: ${error.message}`);
    }

    // Rolling deployments can run this app revision briefly before the new
    // allowlisted RPC migration reaches the target database. Keep public reads
    // operational with a deterministic aggregate-derived key; once the RPC is
    // present, moderation changes use the exact revision ledger below.
    const stats = await getAppV2PublicDataStats();
    const changedAt = stats.latestPublicImportAt ?? new Date(0).toISOString();
    const changedAtMilliseconds = Date.parse(changedAt);
    const revision = [
      Number.isFinite(changedAtMilliseconds) ? changedAtMilliseconds : 0,
      stats.publicRegistrations,
      stats.publicCapacity,
      stats.mappedRegistrations,
      stats.mappedCapacity,
    ].join("-");

    return {
      revision,
      publicationId: null,
      changedAt,
      cacheKey: `aggregate:${revision}`,
    };
  }

  const row = data as PublicDataRevisionRow;
  const revision = String(row.revision);
  return {
    revision,
    publicationId: row.publication_id,
    changedAt: row.changed_at,
    cacheKey: `${row.publication_id ?? "unpublished"}:${revision}`,
  };
}

export async function getLatestAppV2ImportRun(sourceName?: string) {
  const supabase = createAppV2AdminClient();
  let query = supabase
    .from("import_runs")
    .select(
      "id, source_name, source_url, status, records_seen, records_upserted, started_at, finished_at, error_summary, pages_fetched, last_successful_page, last_successful_cursor, resumed_from_import_run_id, missing_transitions_applied, missing_transitions_skipped_reason",
    )
    .order("started_at", { ascending: false })
    .limit(1);

  if (sourceName) {
    query = query.eq("source_name", sourceName);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error("Could not load latest app_v2 import run.");
  }

  return data ? normalizeImportRun(data as ImportRunRow) : null;
}

export async function getLatestSuccessfulAppV2ImportRun(sourceName?: string) {
  const supabase = createAppV2AdminClient();
  let query = supabase
    .from("import_runs")
    .select(
      "id, source_name, source_url, status, records_seen, records_upserted, started_at, finished_at, error_summary, pages_fetched, last_successful_page, last_successful_cursor, resumed_from_import_run_id, missing_transitions_applied, missing_transitions_skipped_reason",
    )
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false })
    .limit(1);

  if (sourceName) {
    query = query.eq("source_name", sourceName);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Could not load latest successful app_v2 import run: ${error.message}`);
  }
  return data ? normalizeImportRun(data as ImportRunRow) : null;
}
