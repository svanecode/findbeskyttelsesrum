import { getMunicipalitySlugCandidates, normalizeMunicipalityDisplay } from "@/lib/municipalities/metadata";
import { createAppV2AdminClient } from "@/lib/supabase/app-v2";

type AppV2ShelterStatus = "active" | "temporarily_closed" | "under_review";
type AppV2ImportState = "active" | "missing_from_source" | "suppressed";
type AppV2ImportRunStatus = "running" | "succeeded" | "failed";

type MunicipalityRow = {
  id: string;
  code: string | null;
  slug: string;
  name: string;
  description: string | null;
  region_name: string | null;
};

type ShelterRow = {
  id: string;
  municipality_id: string;
  slug: string;
  name: string;
  address_line1: string;
  postal_code: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  capacity: number;
  status: AppV2ShelterStatus;
  accessibility_notes: string | null;
  summary: string;
  source_summary: string;
  import_state: AppV2ImportState;
  last_seen_at: string | null;
  last_imported_at: string | null;
  canonical_source_name: string | null;
  canonical_source_reference: string | null;
};

type ImportRunRow = {
  id: string;
  source_name: string;
  source_url: string | null;
  status: AppV2ImportRunStatus;
  records_seen: number;
  records_upserted: number;
  started_at: string;
  finished_at: string | null;
  error_summary: string | null;
  pages_fetched: number;
  last_successful_page: number | null;
  last_successful_cursor: string | null;
  resumed_from_import_run_id: string | null;
  missing_transitions_applied: boolean;
  missing_transitions_skipped_reason: string | null;
};

export type AppV2MunicipalitySummary = {
  id: string;
  code: string | null;
  slug: string;
  name: string;
  regionName: string | null;
  activeShelterCount: number;
};

export type AppV2MunicipalityDetail = AppV2MunicipalitySummary & {
  description: string | null;
};

export type AppV2ShelterDetail = {
  id: string;
  slug: string;
  name: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  capacity: number;
  status: AppV2ShelterStatus;
  accessibilityNotes: string | null;
  summary: string;
  sourceSummary: string;
  importState: AppV2ImportState;
  lastSeenAt: string | null;
  lastImportedAt: string | null;
  canonicalSourceName: string | null;
  canonicalSourceReference: string | null;
  municipality: AppV2MunicipalityDetail;
};

export type AppV2ImportRunSummary = {
  id: string;
  sourceName: string;
  sourceUrl: string | null;
  status: AppV2ImportRunStatus;
  recordsSeen: number;
  recordsUpserted: number;
  startedAt: string;
  finishedAt: string | null;
  errorSummary: string | null;
  pagesFetched: number;
  lastSuccessfulPage: number | null;
  lastSuccessfulCursor: string | null;
  resumedFromImportRunId: string | null;
  missingTransitionsApplied: boolean;
  missingTransitionsSkippedReason: string | null;
};

type ShelterCountOptions = {
  includeMissing?: boolean;
};

const shelterCapacityPageSize = 1000;

function createAppV2ReadClient() {
  return createAppV2AdminClient();
}

function normalizeMunicipality(row: MunicipalityRow, activeShelterCount: number): AppV2MunicipalityDetail {
  const display = normalizeMunicipalityDisplay({
    id: row.id,
    slug: row.slug,
    name: row.name,
  });

  return {
    id: row.id,
    code: row.code,
    slug: display.slug,
    name: display.name,
    description: row.description,
    regionName: row.region_name,
    activeShelterCount,
  };
}

function normalizeImportRun(row: ImportRunRow): AppV2ImportRunSummary {
  return {
    id: row.id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    status: row.status,
    recordsSeen: row.records_seen,
    recordsUpserted: row.records_upserted,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorSummary: row.error_summary,
    pagesFetched: row.pages_fetched,
    lastSuccessfulPage: row.last_successful_page,
    lastSuccessfulCursor: row.last_successful_cursor,
    resumedFromImportRunId: row.resumed_from_import_run_id,
    missingTransitionsApplied: row.missing_transitions_applied,
    missingTransitionsSkippedReason: row.missing_transitions_skipped_reason,
  };
}

function normalizeShelter(row: ShelterRow, municipality: AppV2MunicipalityDetail): AppV2ShelterDetail {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    addressLine1: row.address_line1,
    postalCode: row.postal_code,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    capacity: row.capacity,
    status: row.status,
    accessibilityNotes: row.accessibility_notes,
    summary: row.summary,
    sourceSummary: row.source_summary,
    importState: row.import_state,
    lastSeenAt: row.last_seen_at,
    lastImportedAt: row.last_imported_at,
    canonicalSourceName: row.canonical_source_name,
    canonicalSourceReference: row.canonical_source_reference,
    municipality,
  };
}

async function getActiveShelterCountByMunicipalityId(municipalityId: string) {
  const supabase = createAppV2ReadClient();
  const { count, error } = await supabase
    .from("shelters")
    .select("id", { count: "exact", head: true })
    .eq("municipality_id", municipalityId)
    .eq("import_state", "active");

  if (error) {
    throw new Error(`Could not count active app_v2 shelters for municipality "${municipalityId}".`);
  }

  return count ?? 0;
}

export async function getAppV2ShelterCount(options: ShelterCountOptions = {}) {
  const supabase = createAppV2ReadClient();
  const query = supabase.from("shelters").select("id", { count: "exact", head: true });
  const scopedQuery = options.includeMissing ? query : query.eq("import_state", "active");
  const { count, error } = await scopedQuery;

  if (error) {
    throw new Error("Could not count app_v2 shelters.");
  }

  return count ?? 0;
}

export async function getAppV2TotalShelterCapacity() {
  const supabase = createAppV2ReadClient();
  let totalCapacity = 0;
  let from = 0;

  while (true) {
    const to = from + shelterCapacityPageSize - 1;
    const { data, error } = await supabase
      .from("shelters")
      .select("capacity")
      .eq("import_state", "active")
      .range(from, to);

    if (error) {
      throw new Error("Could not load app_v2 shelter capacity.");
    }

    const rows = (data ?? []) as Array<{ capacity: number | null }>;

    for (const row of rows) {
      totalCapacity += row.capacity ?? 0;
    }

    if (rows.length < shelterCapacityPageSize) {
      break;
    }

    from += shelterCapacityPageSize;
  }

  return totalCapacity;
}

export async function getLatestAppV2ImportRun(sourceName?: string) {
  const supabase = createAppV2ReadClient();
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

export async function getAppV2MunicipalitySummaries() {
  const supabase = createAppV2ReadClient();
  const { data, error } = await supabase
    .from("municipalities")
    .select("id, code, slug, name, description, region_name")
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Could not load app_v2 municipalities.");
  }

  const rows = (data ?? []) as MunicipalityRow[];

  return Promise.all(
    rows.map(async (row) => {
      const activeShelterCount = await getActiveShelterCountByMunicipalityId(row.id);
      return normalizeMunicipality(row, activeShelterCount);
    }),
  );
}

export async function getAppV2MunicipalityBySlug(slug: string) {
  const supabase = createAppV2ReadClient();
  const slugCandidates = getMunicipalitySlugCandidates(slug);
  const { data, error } = await supabase
    .from("municipalities")
    .select("id, code, slug, name, description, region_name")
    .in("slug", slugCandidates)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load app_v2 municipality "${slug}".`);
  }

  if (!data) {
    return null;
  }

  const row = data as MunicipalityRow;
  const activeShelterCount = await getActiveShelterCountByMunicipalityId(row.id);

  return normalizeMunicipality(row, activeShelterCount);
}

export async function getAppV2ShelterBySlug(slug: string) {
  const supabase = createAppV2ReadClient();
  const { data: shelterData, error: shelterError } = await supabase
    .from("shelters")
    .select(
      "id, municipality_id, slug, name, address_line1, postal_code, city, latitude, longitude, capacity, status, accessibility_notes, summary, source_summary, import_state, last_seen_at, last_imported_at, canonical_source_name, canonical_source_reference",
    )
    .eq("slug", slug)
    .eq("import_state", "active")
    .maybeSingle();

  if (shelterError) {
    throw new Error(`Could not load app_v2 shelter "${slug}".`);
  }

  if (!shelterData) {
    return null;
  }

  const shelter = shelterData as ShelterRow;
  const { data: municipalityData, error: municipalityError } = await supabase
    .from("municipalities")
    .select("id, code, slug, name, description, region_name")
    .eq("id", shelter.municipality_id)
    .single();

  if (municipalityError || !municipalityData) {
    throw new Error(`Could not load app_v2 municipality for shelter "${slug}".`);
  }

  const activeShelterCount = await getActiveShelterCountByMunicipalityId(shelter.municipality_id);
  const municipality = normalizeMunicipality(municipalityData as MunicipalityRow, activeShelterCount);

  return normalizeShelter(shelter, municipality);
}
