import { getMunicipalitySlugCandidates, normalizeMunicipalityDisplay } from "@/lib/municipalities/metadata";
import { createAppV2AdminClient } from "@/lib/supabase/app-v2";

export type AppV2ShelterStatus = "active" | "temporarily_closed" | "under_review";
export type AppV2ImportState = "active" | "missing_from_source" | "suppressed";
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

type ShelterExclusionRow = {
  shelter_id: string | null;
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

export type AppV2NearbyShelter = {
  id: string;
  slug: string;
  name: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  latitude: number;
  longitude: number;
  capacity: number;
  status: AppV2ShelterStatus;
  importState: AppV2ImportState;
  distanceMeters: number;
  municipality: AppV2MunicipalitySummary;
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

export type AppV2NearbySheltersOptions = {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  limit?: number;
  candidateLimit?: number;
  importStates?: AppV2ImportState[];
};

const shelterCapacityPageSize = 1000;
const defaultNearbyRadiusMeters = 50_000;
const defaultNearbyLimit = 10;
const defaultNearbyCandidateLimit = 500;
const defaultNearbyImportStates: AppV2ImportState[] = ["active"];
const allowedImportStates: AppV2ImportState[] = ["active", "missing_from_source", "suppressed"];
const earthRadiusMeters = 6_371_000;

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

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function assertValidCoordinate(input: AppV2NearbySheltersOptions) {
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    throw new Error("Nearby app_v2 query requires latitude between -90 and 90.");
  }

  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new Error("Nearby app_v2 query requires longitude between -180 and 180.");
  }
}

function getNearbyImportStates(input: AppV2NearbySheltersOptions) {
  const importStates = Array.from(new Set(input.importStates ?? defaultNearbyImportStates));

  if (importStates.length === 0) {
    throw new Error("Nearby app_v2 query requires at least one import state.");
  }

  const invalidStates = importStates.filter((state) => !allowedImportStates.includes(state));

  if (invalidStates.length > 0) {
    throw new Error(`Nearby app_v2 query received unsupported import states: ${invalidStates.join(", ")}.`);
  }

  return importStates;
}

function getNearbyBounds(latitude: number, longitude: number, radiusMeters: number) {
  const latitudeDelta = toDegrees(radiusMeters / earthRadiusMeters);
  const latitudeRadians = toRadians(latitude);
  const longitudeDivisor = Math.max(Math.cos(latitudeRadians), 0.01);
  const longitudeDelta = toDegrees(radiusMeters / (earthRadiusMeters * longitudeDivisor));

  return {
    minLatitude: Math.max(latitude - latitudeDelta, -90),
    maxLatitude: Math.min(latitude + latitudeDelta, 90),
    minLongitude: Math.max(longitude - longitudeDelta, -180),
    maxLongitude: Math.min(longitude + longitudeDelta, 180),
  };
}

function getDistanceMeters(input: {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
}) {
  const fromLatitude = toRadians(input.fromLatitude);
  const toLatitude = toRadians(input.toLatitude);
  const latitudeDelta = toRadians(input.toLatitude - input.fromLatitude);
  const longitudeDelta = toRadians(input.toLongitude - input.fromLongitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function toFiniteNumber(value: number | string | null) {
  if (value === null) {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function getSourceIdentityKey(sourceName: string | null, sourceReference: string | null) {
  return sourceName && sourceReference ? `${sourceName}\u0000${sourceReference}` : null;
}

async function getActiveExclusionsForShelters(shelters: ShelterRow[]) {
  const supabase = createAppV2ReadClient();
  const shelterIds = Array.from(new Set(shelters.map((row) => row.id)));
  const sourceNames = Array.from(
    new Set(shelters.map((row) => row.canonical_source_name).filter((value): value is string => Boolean(value))),
  );
  const sourceReferences = Array.from(
    new Set(
      shelters.map((row) => row.canonical_source_reference).filter((value): value is string => Boolean(value)),
    ),
  );
  const [shelterExclusions, sourceExclusions] = await Promise.all([
    shelterIds.length > 0
      ? supabase
          .from("shelter_exclusions")
          .select("shelter_id, canonical_source_name, canonical_source_reference")
          .eq("is_active", true)
          .in("shelter_id", shelterIds)
      : Promise.resolve({ data: [], error: null }),
    sourceNames.length > 0 && sourceReferences.length > 0
      ? supabase
          .from("shelter_exclusions")
          .select("shelter_id, canonical_source_name, canonical_source_reference")
          .eq("is_active", true)
          .in("canonical_source_name", sourceNames)
          .in("canonical_source_reference", sourceReferences)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (shelterExclusions.error || sourceExclusions.error) {
    throw new Error("Could not load active app_v2 shelter exclusions.");
  }

  const rows = [
    ...((shelterExclusions.data ?? []) as ShelterExclusionRow[]),
    ...((sourceExclusions.data ?? []) as ShelterExclusionRow[]),
  ];

  return {
    excludedShelterIds: new Set(rows.map((row) => row.shelter_id).filter((value): value is string => Boolean(value))),
    excludedSourceIdentityKeys: new Set(
      rows
        .map((row) => getSourceIdentityKey(row.canonical_source_name, row.canonical_source_reference))
        .filter((value): value is string => Boolean(value)),
    ),
  };
}

function isExcludedShelter(
  row: ShelterRow,
  exclusions: Awaited<ReturnType<typeof getActiveExclusionsForShelters>>,
) {
  const sourceIdentityKey = getSourceIdentityKey(row.canonical_source_name, row.canonical_source_reference);

  return (
    exclusions.excludedShelterIds.has(row.id) ||
    (sourceIdentityKey !== null && exclusions.excludedSourceIdentityKeys.has(sourceIdentityKey))
  );
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

export async function getAppV2NearbyShelters(options: AppV2NearbySheltersOptions): Promise<AppV2NearbyShelter[]> {
  assertValidCoordinate(options);

  const supabase = createAppV2ReadClient();
  const radiusMeters = options.radiusMeters ?? defaultNearbyRadiusMeters;
  const limit = options.limit ?? defaultNearbyLimit;
  const candidateLimit = options.candidateLimit ?? defaultNearbyCandidateLimit;
  const importStates = getNearbyImportStates(options);

  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    throw new Error("Nearby app_v2 query requires a positive radiusMeters value.");
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Nearby app_v2 query requires a positive integer limit.");
  }

  if (!Number.isInteger(candidateLimit) || candidateLimit <= 0) {
    throw new Error("Nearby app_v2 query requires a positive integer candidateLimit.");
  }

  const bounds = getNearbyBounds(options.latitude, options.longitude, radiusMeters);
  const { data, error } = await supabase
    .from("shelters")
    .select(
      "id, municipality_id, slug, name, address_line1, postal_code, city, latitude, longitude, capacity, status, accessibility_notes, summary, source_summary, import_state, last_seen_at, last_imported_at, canonical_source_name, canonical_source_reference",
    )
    .in("import_state", importStates)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .gte("latitude", bounds.minLatitude)
    .lte("latitude", bounds.maxLatitude)
    .gte("longitude", bounds.minLongitude)
    .lte("longitude", bounds.maxLongitude)
    .limit(candidateLimit);

  if (error) {
    throw new Error("Could not load app_v2 nearby shelter candidates.");
  }

  const visibleShelterRows = (data ?? []) as ShelterRow[];
  const exclusions = await getActiveExclusionsForShelters(visibleShelterRows);
  const shelterCandidates = visibleShelterRows
    .filter((row) => !isExcludedShelter(row, exclusions))
    .map((row) => {
      const latitude = toFiniteNumber(row.latitude);
      const longitude = toFiniteNumber(row.longitude);

      if (latitude === null || longitude === null) {
        return null;
      }

      return {
        row,
        latitude,
        longitude,
        distanceMeters: getDistanceMeters({
          fromLatitude: options.latitude,
          fromLongitude: options.longitude,
          toLatitude: latitude,
          toLongitude: longitude,
        }),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .filter((candidate) => candidate.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);

  if (shelterCandidates.length === 0) {
    return [];
  }

  const municipalityIds = Array.from(new Set(shelterCandidates.map((candidate) => candidate.row.municipality_id)));
  const { data: municipalityData, error: municipalityError } = await supabase
    .from("municipalities")
    .select("id, code, slug, name, description, region_name")
    .in("id", municipalityIds);

  if (municipalityError) {
    throw new Error("Could not load app_v2 municipalities for nearby shelters.");
  }

  const municipalitiesById = new Map(
    ((municipalityData ?? []) as MunicipalityRow[]).map((row) => [row.id, normalizeMunicipality(row, 0)]),
  );

  return shelterCandidates.map(({ row, latitude, longitude, distanceMeters }) => {
    const municipality = municipalitiesById.get(row.municipality_id);

    if (!municipality) {
      throw new Error(`Could not resolve app_v2 municipality for nearby shelter "${row.slug}".`);
    }

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      addressLine1: row.address_line1,
      postalCode: row.postal_code,
      city: row.city,
      latitude,
      longitude,
      capacity: row.capacity,
      status: row.status,
      importState: row.import_state,
      distanceMeters,
      municipality,
    };
  });
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

export async function getAppV2MunicipalitySlugs() {
  const supabase = createAppV2ReadClient();
  const { data, error } = await supabase
    .from("municipalities")
    .select("id, code, slug, name, description, region_name")
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Could not load app_v2 municipality slugs.");
  }

  const rows = (data ?? []) as MunicipalityRow[];

  return rows.map((row) => normalizeMunicipality(row, 0).slug);
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
