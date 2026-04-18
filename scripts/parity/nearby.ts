import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import {
  getAppV2GroupedNearbySheltersWithDiagnostics,
  getAppV2NearbySheltersWithDiagnostics,
  type AppV2NearbyEligibilityMode,
  type AppV2ImportState,
  type AppV2GroupedNearbyShelter,
  type AppV2NearbyShelter,
  type AppV2NearbyDiagnostics,
} from "@/lib/supabase/app-v2-queries";

type LegacyNearbyShelter = {
  id: string;
  bygning_id: string | null;
  kommunekode: string | null;
  total_capacity: number | null;
  address: string | null;
  postnummer: string | null;
  vejnavn: string | null;
  husnummer: string | null;
  location: {
    type: string;
    coordinates: number[];
  } | null;
  anvendelse: string | null;
  distance: number | null;
  shelter_count: number | null;
};

type NearbyParityEnv =
  | {
      ok: true;
      url: string;
      anonKey: string;
      secretKey: string;
    }
  | {
      ok: false;
      missing: string[];
    };

type NearbyParityOptions = {
  sample: string;
  appV2Shape: "grouped" | "row";
  eligibilityMode: AppV2NearbyEligibilityMode;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  limit: number;
  candidateLimit: number;
  includeSuppressed: boolean;
};

const coordinateSamples = {
  copenhagen: {
    label: "Copenhagen",
    latitude: 55.6761,
    longitude: 12.5683,
  },
  aarhus: {
    label: "Aarhus",
    latitude: 56.1629,
    longitude: 10.2039,
  },
  lemvig: {
    label: "Lemvig",
    latitude: 56.5486,
    longitude: 8.3102,
  },
} satisfies Record<string, { label: string; latitude: number; longitude: number }>;

const defaultOptions = {
  sample: "copenhagen",
  appV2Shape: "grouped" as const,
  eligibilityMode: "legacy_capacity_v1" as const,
  radiusMeters: 50_000,
  limit: 10,
  candidateLimit: 500,
};

const sampleLimit = 10;

function getFlagValue(flag: string) {
  const flagIndex = process.argv.findIndex((value) => value === flag);

  return flagIndex === -1 ? undefined : process.argv[flagIndex + 1];
}

function parseNumberFlag(flag: string, fallback: number) {
  const raw = getFlagValue(flag);

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be followed by a finite number.`);
  }

  return parsed;
}

function parseIntegerFlag(flag: string, fallback: number) {
  const parsed = parseNumberFlag(flag, fallback);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be followed by a positive integer.`);
  }

  return parsed;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function printHelp() {
  console.log(`Read-only legacy/app_v2 nearby parity check.

Usage:
  npm run parity:nearby -- --sample copenhagen
  npm run parity:nearby -- --lat 55.6761 --lng 12.5683 --radius 50000 --limit 10

Options:
  --sample              Named coordinate sample: ${Object.keys(coordinateSamples).join(", ")}.
  --lat                 Latitude. Overrides --sample latitude when provided.
  --lng                 Longitude. Overrides --sample longitude when provided.
  --radius              Radius in meters. Defaults to ${defaultOptions.radiusMeters}.
  --limit               Result limit. Defaults to ${defaultOptions.limit}.
  --candidate-limit     app_v2 candidate limit. Defaults to ${defaultOptions.candidateLimit}.
  --app-v2-shape        app_v2 comparison shape: grouped or row. Defaults to ${defaultOptions.appV2Shape}.
  --eligibility         app_v2 eligibility mode: legacy-capacity, source-application-code, or none. Defaults to legacy-capacity.
  --include-suppressed  Include app_v2 suppressed rows for diagnostics.
  --help                Print this help text.

The script is read-only. It compares legacy nearby RPC output with app_v2 nearby RPC/helper output when the required Supabase env vars are available.`);
}

function getSample() {
  const sampleName = getFlagValue("--sample") ?? defaultOptions.sample;
  const sample = coordinateSamples[sampleName as keyof typeof coordinateSamples];

  if (!sample) {
    throw new Error(`Unknown --sample "${sampleName}". Expected one of: ${Object.keys(coordinateSamples).join(", ")}.`);
  }

  return {
    name: sampleName,
    ...sample,
  };
}

function getOptions(): NearbyParityOptions {
  const sample = getSample();
  const appV2Shape = getFlagValue("--app-v2-shape") ?? defaultOptions.appV2Shape;
  const rawEligibility = getFlagValue("--eligibility") ?? "legacy-capacity";

  if (appV2Shape !== "grouped" && appV2Shape !== "row") {
    throw new Error('--app-v2-shape must be "grouped" or "row".');
  }

  if (rawEligibility !== "legacy-capacity" && rawEligibility !== "source-application-code" && rawEligibility !== "none") {
    throw new Error('--eligibility must be "legacy-capacity", "source-application-code", or "none".');
  }

  return {
    sample: sample.name,
    appV2Shape,
    eligibilityMode:
      rawEligibility === "legacy-capacity"
        ? "legacy_capacity_v1"
        : rawEligibility === "source-application-code"
          ? "source_application_code_v1"
          : "none",
    latitude: parseNumberFlag("--lat", sample.latitude),
    longitude: parseNumberFlag("--lng", sample.longitude),
    radiusMeters: parseIntegerFlag("--radius", defaultOptions.radiusMeters),
    limit: parseIntegerFlag("--limit", defaultOptions.limit),
    candidateLimit: parseIntegerFlag("--candidate-limit", defaultOptions.candidateLimit),
    includeSuppressed: hasFlag("--include-suppressed"),
  };
}

function getAppV2ImportStates(options: NearbyParityOptions): AppV2ImportState[] {
  return options.includeSuppressed ? ["active", "suppressed"] : ["active"];
}

function getEnv(): NearbyParityEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !anonKey || !secretKey) {
    const missing = [
      ["NEXT_PUBLIC_SUPABASE_URL", url],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
      ["SUPABASE_SECRET_KEY", secretKey],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name as string);

    return { ok: false, missing };
  }

  return { ok: true, url, anonKey, secretKey };
}

async function retryRpc<T>(fn: () => Promise<{ data: T | null; error: unknown }>) {
  let lastResponse: { data: T | null; error: unknown } | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    lastResponse = await fn();

    if (!lastResponse.error) {
      return lastResponse;
    }
  }

  return lastResponse;
}

function getErrorMessage(error: unknown) {
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : "Unknown Supabase RPC error.";
}

async function readLegacyNearbyShelters(input: NearbyParityOptions, env: Extract<NearbyParityEnv, { ok: true }>) {
  const supabase = createClient(env.url, env.anonKey, {
    auth: {
      persistSession: false,
    },
    db: {
      schema: "public",
    },
  });
  const shouldUseV3 = process.env.NEXT_PUBLIC_USE_SHELTERS_V3 !== "false";
  let rpcName = shouldUseV3 ? "get_nearby_shelters_v3" : "get_nearby_shelters_v2";
  let response = await retryRpc<LegacyNearbyShelter[]>(async () =>
    shouldUseV3
      ? supabase.rpc("get_nearby_shelters_v3", {
          p_lat: input.latitude,
          p_lng: input.longitude,
          p_radius_meters: input.radiusMeters,
        })
      : supabase.rpc("get_nearby_shelters_v2", {
          p_lat: input.latitude,
          p_lng: input.longitude,
        }),
  );

  if (response?.error && shouldUseV3) {
    rpcName = "get_nearby_shelters_v2";
    response = await retryRpc<LegacyNearbyShelter[]>(async () =>
      supabase.rpc("get_nearby_shelters_v2", {
        p_lat: input.latitude,
        p_lng: input.longitude,
      }),
    );
  }

  if (!response || response.error) {
    throw new Error(`Could not read legacy nearby shelters through ${rpcName}: ${getErrorMessage(response?.error)}`);
  }

  return {
    rpcName,
    rows: response.data ?? [],
  };
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeAddressKey(value: string | null | undefined) {
  return normalizeText(value)
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLegacyAddressKey(row: LegacyNearbyShelter) {
  return normalizeAddressKey(
    row.address || [row.vejnavn, row.husnummer, row.postnummer].filter(Boolean).join(" "),
  );
}

function getAppV2AddressKey(row: AppV2NearbyShelter) {
  return normalizeAddressKey([row.addressLine1, row.postalCode, row.city].filter(Boolean).join(" "));
}

function getAppV2GroupedAddressKey(row: AppV2GroupedNearbyShelter) {
  return normalizeAddressKey([row.addressLine1, row.postalCode, row.city].filter(Boolean).join(" "));
}

function formatLegacyRow(row: LegacyNearbyShelter) {
  const distanceKm = ((row.distance ?? 0) / 1000).toFixed(1);
  const address = row.address || [row.vejnavn, row.husnummer].filter(Boolean).join(" ") || "unknown address";

  return `${address}, ${row.postnummer ?? "unknown postal"} | distance=${distanceKm}km groupedCount=${row.shelter_count ?? "n/a"} capacity=${row.total_capacity ?? "n/a"} id=${row.id}`;
}

function formatAppV2Row(row: AppV2NearbyShelter) {
  const distanceKm = (row.distanceMeters / 1000).toFixed(1);

  return `${row.addressLine1}, ${row.postalCode} ${row.city} | distance=${distanceKm}km capacity=${row.capacity} status=${row.status} importState=${row.importState} municipality=${row.municipality.name} id=${row.id}`;
}

function formatAppV2GroupedRow(row: AppV2GroupedNearbyShelter) {
  const distanceKm = (row.distanceMeters / 1000).toFixed(1);

  return `${row.addressLine1}, ${row.postalCode} ${row.city} | distance=${distanceKm}km groupedCount=${row.shelterCount} capacity=${row.totalCapacity} statuses=${row.statuses.join(",")} importStates=${row.importStates.join(",")} representative=${row.representativeShelter.id}`;
}

function printSamples(title: string, rows: string[]) {
  console.log(`${title}: ${rows.length}`);

  if (rows.length === 0) {
    console.log("  none");
    return;
  }

  for (const row of rows.slice(0, sampleLimit)) {
    console.log(`  - ${row}`);
  }

  if (rows.length > sampleLimit) {
    console.log(`  ... ${rows.length - sampleLimit} more`);
  }
}

function getAppV2ComparableAddressKey(row: AppV2NearbyShelter | AppV2GroupedNearbyShelter, shape: NearbyParityOptions["appV2Shape"]) {
  return shape === "grouped"
    ? getAppV2GroupedAddressKey(row as AppV2GroupedNearbyShelter)
    : getAppV2AddressKey(row as AppV2NearbyShelter);
}

function summarizeRankOverlap(input: {
  legacyRows: LegacyNearbyShelter[];
  appV2Rows: Array<AppV2NearbyShelter | AppV2GroupedNearbyShelter>;
  appV2Shape: NearbyParityOptions["appV2Shape"];
}) {
  const legacyRanks = new Map<string, { rank: number; row: LegacyNearbyShelter }>();
  const appV2Ranks = new Map<string, { rank: number; row: AppV2NearbyShelter | AppV2GroupedNearbyShelter }>();

  input.legacyRows.forEach((row, index) => {
    const key = getLegacyAddressKey(row);

    if (key && !legacyRanks.has(key)) {
      legacyRanks.set(key, { rank: index + 1, row });
    }
  });

  input.appV2Rows.forEach((row, index) => {
    const key = getAppV2ComparableAddressKey(row, input.appV2Shape);

    if (key && !appV2Ranks.has(key)) {
      appV2Ranks.set(key, { rank: index + 1, row });
    }
  });

  const shared = Array.from(legacyRanks.entries())
    .flatMap(([key, legacyRank]) => {
      const appV2Rank = appV2Ranks.get(key);

      return appV2Rank
        ? [
            {
              key,
              legacyRank: legacyRank.rank,
              appV2Rank: appV2Rank.rank,
              delta: appV2Rank.rank - legacyRank.rank,
            },
          ]
        : [];
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.legacyRank - b.legacyRank);

  const exactRankMatches = shared.filter((entry) => entry.delta === 0).length;
  const totalAbsDelta = shared.reduce((sum, entry) => sum + Math.abs(entry.delta), 0);
  const averageAbsDelta = shared.length > 0 ? totalAbsDelta / shared.length : 0;
  const maxAbsDelta = shared.reduce((max, entry) => Math.max(max, Math.abs(entry.delta)), 0);

  return {
    shared,
    exactRankMatches,
    averageAbsDelta,
    maxAbsDelta,
  };
}

async function main() {
  if (hasFlag("--help")) {
    printHelp();
    return;
  }

  console.log("[parity:nearby] read-only legacy/app_v2 nearby parity check");

  const options = getOptions();
  const env = getEnv();

  console.log(`[parity:nearby] sample: ${options.sample}`);
  console.log(
    `[parity:nearby] input lat=${options.latitude} lng=${options.longitude} radiusMeters=${options.radiusMeters} limit=${options.limit} candidateLimit=${options.candidateLimit}`,
  );
  console.log(`[parity:nearby] app_v2 comparison shape: ${options.appV2Shape}`);
  console.log(`[parity:nearby] app_v2 eligibility: ${options.eligibilityMode}`);
  console.log(`[parity:nearby] app_v2 import states: ${getAppV2ImportStates(options).join(", ")}`);
  console.log(
    `[parity:nearby] note: legacy nearby is grouped by address/location; app_v2 comparison is ${options.appV2Shape}.`,
  );
  console.log(
    "[parity:nearby] note: app_v2 nearby uses the app_v2.get_nearby_shelters database RPC for bounding-box filtering, Haversine distance ordering, and active app_v2 shelter_exclusions.",
  );
  console.log(
    "[parity:nearby] note: legacy public.excluded_shelters address and bygning_id matching is not mirrored yet.",
  );
  console.log(
    "[parity:nearby] note: address-key matching lowercases, trims, collapses whitespace, and treats commas as separators; it does not do fuzzy typo matching.",
  );

  if (!env.ok) {
    console.log(`[parity:nearby] skipped: missing env vars: ${env.missing.join(", ")}`);
    console.log("[parity:nearby] no database reads were attempted.");
    return;
  }

  const [legacyResult, appV2Result] = await Promise.all([
    readLegacyNearbyShelters(options, env),
    options.appV2Shape === "grouped"
      ? getAppV2GroupedNearbySheltersWithDiagnostics({
          latitude: options.latitude,
          longitude: options.longitude,
          radiusMeters: options.radiusMeters,
          limit: options.limit,
          candidateLimit: options.candidateLimit,
          importStates: getAppV2ImportStates(options),
          eligibilityMode: options.eligibilityMode,
        })
      : getAppV2NearbySheltersWithDiagnostics({
          latitude: options.latitude,
          longitude: options.longitude,
          radiusMeters: options.radiusMeters,
          limit: options.limit,
          candidateLimit: options.candidateLimit,
          importStates: getAppV2ImportStates(options),
          eligibilityMode: options.eligibilityMode,
        }),
  ]);

  const legacyRows = legacyResult.rows;
  const appV2Rows = appV2Result.rows;
  const legacyAddressKeys = new Set(legacyRows.map(getLegacyAddressKey).filter(Boolean));
  const appV2AddressKeys = new Set(
    appV2Rows
      .map((row) =>
        options.appV2Shape === "grouped"
          ? getAppV2GroupedAddressKey(row as AppV2GroupedNearbyShelter)
          : getAppV2AddressKey(row as AppV2NearbyShelter),
      )
      .filter(Boolean),
  );
  const sharedAddressKeys = Array.from(legacyAddressKeys).filter((key) => appV2AddressKeys.has(key));
  const legacyOnlyAddressKeys = Array.from(legacyAddressKeys).filter((key) => !appV2AddressKeys.has(key));
  const appV2OnlyAddressKeys = Array.from(appV2AddressKeys).filter((key) => !legacyAddressKeys.has(key));
  const legacyIds = new Set(legacyRows.map((row) => row.id));
  const appV2Ids = new Set(
    appV2Rows.flatMap((row) =>
      options.appV2Shape === "grouped"
        ? (row as AppV2GroupedNearbyShelter).shelters.map((shelter) => shelter.id)
        : [(row as AppV2NearbyShelter).id],
    ),
  );
  const sharedIds = Array.from(legacyIds).filter((id) => appV2Ids.has(id));
  const diagnostics = appV2Result.diagnostics as AppV2NearbyDiagnostics;
  const rankOverlap = summarizeRankOverlap({
    legacyRows,
    appV2Rows: appV2Rows as Array<AppV2NearbyShelter | AppV2GroupedNearbyShelter>,
    appV2Shape: options.appV2Shape,
  });
  const candidateLimitHit =
    typeof diagnostics.sourceReturnedRows === "number"
      ? diagnostics.sourceReturnedRows >= options.candidateLimit
      : diagnostics.candidateRowsRead >= options.candidateLimit;

  console.log(`[parity:nearby] legacy rpc: ${legacyResult.rpcName}`);
  console.log(`[parity:nearby] legacy result count: ${legacyRows.length}`);
  console.log(`[parity:nearby] app_v2 result count: ${appV2Rows.length}`);
  console.log(`[parity:nearby] shared ids: ${sharedIds.length}`);
  console.log(`[parity:nearby] shared address keys: ${sharedAddressKeys.length}`);
  console.log(`[parity:nearby] legacy-only address keys: ${legacyOnlyAddressKeys.length}`);
  console.log(`[parity:nearby] app_v2-only address keys: ${appV2OnlyAddressKeys.length}`);
  console.log(
    `[parity:nearby] rank overlap: shared=${rankOverlap.shared.length} exactRankMatches=${rankOverlap.exactRankMatches} averageAbsRankDelta=${rankOverlap.averageAbsDelta.toFixed(2)} maxAbsRankDelta=${rankOverlap.maxAbsDelta}`,
  );
  console.log(
    `[parity:nearby] app_v2 diagnostics: readModel=${diagnostics.readModel ?? "unknown"} distanceStrategy=${diagnostics.distanceStrategy ?? "unknown"} spatialIndex=${String(diagnostics.spatialIndex ?? "unknown")} eligibility=${diagnostics.eligibilityMode ?? "unknown"} minimumCapacity=${diagnostics.minimumCapacity ?? "n/a"} filteredByEligibility=${diagnostics.filteredByEligibility ?? "n/a"} eligibleRows=${diagnostics.eligibleRows ?? "n/a"} legacyAnvendelse=${diagnostics.legacyAnvendelseSemantics ?? "unknown"} sourceApplicationCode=${diagnostics.sourceApplicationCodeSemantics ?? "unknown"} sourceCodeRows=${diagnostics.sourceApplicationCodeRows ?? "n/a"} sourceCodeEligibleRows=${diagnostics.sourceApplicationCodeEligibleRows ?? "n/a"} sourceCodeUnknownRows=${diagnostics.sourceApplicationCodeUnknownRows ?? "n/a"} groupedAppV2Shape=${String(diagnostics.groupedAppV2Shape ?? "unknown")} groupedLegacyShape=${String(diagnostics.groupedLegacyShape ?? "unknown")} groupingKey=${diagnostics.groupingKey ?? "none"} sourceReturned=${diagnostics.sourceReturnedRows ?? "n/a"} groupedRows=${diagnostics.groupedRows ?? "n/a"} read=${diagnostics.candidateRowsRead} excluded=${diagnostics.excludedByAppV2Exclusions} withCoordinates=${diagnostics.candidatesWithCoordinates} withinRadius=${diagnostics.candidatesWithinRadius} returned=${diagnostics.returnedRows}`,
  );
  console.log(
    `[parity:nearby] candidate-limit signal: ${candidateLimitHit ? "hit candidateLimit; top-N may be sensitive to candidateLimit and post-RPC eligibility/grouping" : "candidateLimit not hit for returned app_v2 source rows"}`,
  );
  console.log("");

  console.log("[parity:nearby] decision buckets");
  console.log(`  likely comparable by normalized address: ${sharedAddressKeys.length}`);
  console.log(`  legacy grouped-only addresses: ${legacyOnlyAddressKeys.length}`);
  console.log(`  app_v2 ${options.appV2Shape}-only addresses: ${appV2OnlyAddressKeys.length}`);
  console.log(
    `  shape difference: ${
      options.appV2Shape === "grouped"
        ? "app_v2 is grouped by deterministic address key but still lacks legacy anvendelse semantics"
        : "legacy grouped results vs app_v2 one-row-per-shelter remains unresolved"
    }`,
  );
  console.log(
    `  exclusions difference: app_v2 active exclusions filtered=${diagnostics.excludedByAppV2Exclusions}; legacy public.excluded_shelters matching still requires separate exclusions parity review`,
  );
  const legacyAnvendelseNote =
    diagnostics.legacyAnvendelseSemantics === "modeled_by_source_application_code"
      ? "legacy anvendelseskoder.skal_med is modeled through source-backed application-code eligibility"
      : "legacy anvendelseskoder.skal_med remains unresolved";

  console.log(
    `  eligibility difference: app_v2 mode=${diagnostics.eligibilityMode ?? "unknown"} filtered=${diagnostics.filteredByEligibility ?? "n/a"}; ${legacyAnvendelseNote}`,
  );
  console.log(
    `  source application-code eligibility: semantics=${diagnostics.sourceApplicationCodeSemantics ?? "unknown"} sourceCodeRows=${diagnostics.sourceApplicationCodeRows ?? "n/a"} eligibleByCode=${diagnostics.sourceApplicationCodeEligibleRows ?? "n/a"} unknownCodeRows=${diagnostics.sourceApplicationCodeUnknownRows ?? "n/a"}`,
  );
  console.log(
    `  ordering difference: shared=${rankOverlap.shared.length}; exact-rank=${rankOverlap.exactRankMatches}; avg-abs-rank-delta=${rankOverlap.averageAbsDelta.toFixed(2)}; max-abs-rank-delta=${rankOverlap.maxAbsDelta}`,
  );
  console.log(
    `  candidate behavior: ${candidateLimitHit ? "candidateLimit was reached; compare with a larger --candidate-limit before judging top-N quality" : "candidateLimit was not reached by app_v2 source rows"}`,
  );
  console.log("");

  printSamples("legacy top results", legacyRows.map(formatLegacyRow));
  console.log("");
  printSamples(
    "app_v2 top results",
    appV2Rows.map((row) =>
      options.appV2Shape === "grouped"
        ? formatAppV2GroupedRow(row as AppV2GroupedNearbyShelter)
        : formatAppV2Row(row as AppV2NearbyShelter),
    ),
  );
  console.log("");
  printSamples("shared address keys", sharedAddressKeys);
  console.log("");
  printSamples(
    "shared address rank differences",
    rankOverlap.shared.map((entry) => {
      const direction = entry.delta === 0 ? "same rank" : entry.delta > 0 ? `app_v2 +${entry.delta}` : `app_v2 ${entry.delta}`;

      return `${entry.key} | legacyRank=${entry.legacyRank} appV2Rank=${entry.appV2Rank} ${direction}`;
    }),
  );
  console.log("");
  printSamples("legacy-only address keys", legacyOnlyAddressKeys);
  console.log("");
  printSamples("app_v2-only address keys", appV2OnlyAddressKeys);

  if (legacyRows.length === 0 || appV2Rows.length === 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown nearby parity error.";

  console.error(`[parity:nearby] failed: ${message}`);
  process.exit(1);
});
