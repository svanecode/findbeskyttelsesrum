import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import {
  getAppV2GroupedNearbySheltersWithDiagnostics,
  type AppV2NearbyEligibilityMode,
  type AppV2GroupedNearbyShelter,
} from "@/lib/supabase/app-v2-queries";
import {
  getAppV2NearbyAddressKey,
  getLegacyNearbyAddressKey,
  normalizeNearbyAddressText,
} from "@/lib/nearby/address-normalization";

type CoordinateSample = {
  label: string;
  latitude: number;
  longitude: number;
};

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

type LegacyShelterRow = {
  id: string;
  bygning_id: string | null;
  address: string | null;
  vejnavn: string | null;
  husnummer: string | null;
  postnummer: string | null;
  kommunekode: string | null;
  shelter_capacity: number | null;
  anvendelse: string | null;
  deleted: string | null;
};

type AnvendelseskodeRow = {
  kode: string;
  beskrivelse: string | null;
  kategori: string | null;
  skal_med: boolean | null;
};

type Env =
  | {
      ok: true;
      url: string;
      anonKey: string;
    }
  | {
      ok: false;
      missing: string[];
    };

type Options = {
  sample: string;
  radiusMeters: number;
  limit: number;
  candidateLimit: number;
  examples: number;
  eligibilityMode: AppV2NearbyEligibilityMode;
};

type AppV2OnlyClassification =
  | "likely_skal_med_filtered"
  | "legacy_match_still_eligible"
  | "legacy_match_mixed_semantics"
  | "no_exact_legacy_address_match";

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
  aalborg: {
    label: "Aalborg",
    latitude: 57.0488,
    longitude: 9.9217,
  },
  odense: {
    label: "Odense",
    latitude: 55.4038,
    longitude: 10.4024,
  },
  esbjerg: {
    label: "Esbjerg",
    latitude: 55.4765,
    longitude: 8.4594,
  },
} satisfies Record<string, CoordinateSample>;

const defaultOptions: Options = {
  sample: "all",
  radiusMeters: 50_000,
  limit: 10,
  candidateLimit: 500,
  examples: 5,
  eligibilityMode: "legacy_capacity_v1",
};

function getFlagValue(flag: string) {
  const flagIndex = process.argv.findIndex((value) => value === flag);

  return flagIndex === -1 ? undefined : process.argv[flagIndex + 1];
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function parseIntegerFlag(flag: string, fallback: number) {
  const raw = getFlagValue(flag);

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be followed by a positive integer.`);
  }

  return parsed;
}

function getOptions(): Options {
  const sample = getFlagValue("--sample") ?? defaultOptions.sample;
  const rawEligibility = getFlagValue("--eligibility") ?? "legacy-capacity";

  if (sample !== "all" && !(sample in coordinateSamples)) {
    throw new Error(`Unknown --sample "${sample}". Expected all or one of: ${Object.keys(coordinateSamples).join(", ")}.`);
  }

  if (rawEligibility !== "legacy-capacity" && rawEligibility !== "source-application-code" && rawEligibility !== "none") {
    throw new Error('--eligibility must be "legacy-capacity", "source-application-code", or "none".');
  }

  return {
    sample,
    radiusMeters: parseIntegerFlag("--radius", defaultOptions.radiusMeters),
    limit: parseIntegerFlag("--limit", defaultOptions.limit),
    candidateLimit: parseIntegerFlag("--candidate-limit", defaultOptions.candidateLimit),
    examples: parseIntegerFlag("--examples", defaultOptions.examples),
    eligibilityMode:
      rawEligibility === "legacy-capacity"
        ? "legacy_capacity_v1"
        : rawEligibility === "source-application-code"
          ? "source_application_code_v1"
          : "none",
  };
}

function printHelp() {
  console.log(`Read-only nearby semantic mismatch analysis.

Usage:
  npm run read:nearby-semantic-cases
  npm run read:nearby-semantic-cases -- --sample copenhagen

Options:
  --sample            Named coordinate sample or all. Defaults to all.
  --radius            Radius in meters. Defaults to ${defaultOptions.radiusMeters}.
  --limit             Result limit. Defaults to ${defaultOptions.limit}.
  --candidate-limit   app_v2 candidate limit. Defaults to ${defaultOptions.candidateLimit}.
  --examples          Examples per bucket. Defaults to ${defaultOptions.examples}.
  --eligibility       app_v2 eligibility mode: legacy-capacity, source-application-code, or none. Defaults to legacy-capacity.
  --help              Print this help text.

This script is read-only. It compares legacy nearby output with grouped app_v2 nearby output and annotates app_v2-only cases by exact normalized address lookup against legacy sheltersv2/anvendelseskoder.`);
}

function getEnv(): Env {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    const missing = [
      ["NEXT_PUBLIC_SUPABASE_URL", url],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name as string);

    return { ok: false, missing };
  }

  return { ok: true, url, anonKey };
}

function getLegacyAddressKey(row: LegacyNearbyShelter | LegacyShelterRow) {
  return getLegacyNearbyAddressKey(row);
}

function getAppV2AddressKey(row: AppV2GroupedNearbyShelter) {
  return getAppV2NearbyAddressKey(row);
}

function getLegacyLookupKey(row: LegacyShelterRow) {
  return getLegacyNearbyAddressKey(row);
}

function getAppV2LookupKey(row: AppV2GroupedNearbyShelter) {
  return normalizeNearbyAddressText([row.addressLine1, row.postalCode].filter(Boolean).join(" "));
}

function describeAnvendelse(row: LegacyShelterRow, anvendelseskoder: Map<string, AnvendelseskodeRow>) {
  const code = row.anvendelse ?? "unknown";
  const anvendelse = row.anvendelse ? anvendelseskoder.get(row.anvendelse) : undefined;
  const skalMed = anvendelse?.skal_med;
  const description = anvendelse?.beskrivelse ?? "unknown description";

  return `${code} skal_med=${skalMed === undefined || skalMed === null ? "unknown" : String(skalMed)} ${description}`;
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
    : "Unknown Supabase error.";
}

function createPublicClient(env: Extract<Env, { ok: true }>) {
  return createClient(env.url, env.anonKey, {
    auth: {
      persistSession: false,
    },
    db: {
      schema: "public",
    },
  });
}

async function readLegacyNearbyShelters(
  input: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  },
  env: Extract<Env, { ok: true }>,
) {
  const supabase = createPublicClient(env);
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

async function readAnvendelseskoder(env: Extract<Env, { ok: true }>) {
  const supabase = createPublicClient(env);
  const { data, error } = await supabase
    .from("anvendelseskoder")
    .select("kode, beskrivelse, kategori, skal_med")
    .order("kode");

  if (error) {
    throw new Error(`Could not read legacy anvendelseskoder: ${error.message}`);
  }

  const rows = (data ?? []) as AnvendelseskodeRow[];

  return new Map(rows.map((row) => [row.kode, row]));
}

async function findLegacyRowsForAppV2Group(
  row: AppV2GroupedNearbyShelter,
  env: Extract<Env, { ok: true }>,
) {
  const supabase = createPublicClient(env);
  const { data, error } = await supabase
    .from("sheltersv2")
    .select("id, bygning_id, address, vejnavn, husnummer, postnummer, kommunekode, shelter_capacity, anvendelse, deleted")
    .eq("postnummer", row.postalCode)
    .ilike("address", `${row.addressLine1}%`)
    .limit(50);

  if (error) {
    throw new Error(`Could not read legacy sheltersv2 rows for ${row.addressLine1}, ${row.postalCode}: ${error.message}`);
  }

  const appV2LookupKey = getAppV2LookupKey(row);

  return ((data ?? []) as LegacyShelterRow[]).filter((legacyRow) => getLegacyLookupKey(legacyRow) === appV2LookupKey);
}

function classifyAppV2Only(
  legacyRows: LegacyShelterRow[],
  anvendelseskoder: Map<string, AnvendelseskodeRow>,
): AppV2OnlyClassification {
  if (legacyRows.length === 0) {
    return "no_exact_legacy_address_match";
  }

  const activeRows = legacyRows.filter((row) => row.deleted === null);
  const rowsToInspect = activeRows.length > 0 ? activeRows : legacyRows;
  const eligibleRows = rowsToInspect.filter((row) => {
    const skalMed = row.anvendelse ? anvendelseskoder.get(row.anvendelse)?.skal_med : undefined;
    return skalMed === true && (row.shelter_capacity ?? 0) >= 40;
  });
  const filteredRows = rowsToInspect.filter((row) => {
    const skalMed = row.anvendelse ? anvendelseskoder.get(row.anvendelse)?.skal_med : undefined;
    return skalMed === false || (row.shelter_capacity ?? 0) < 40;
  });

  if (eligibleRows.length > 0 && filteredRows.length > 0) {
    return "legacy_match_mixed_semantics";
  }

  if (eligibleRows.length > 0) {
    return "legacy_match_still_eligible";
  }

  return "likely_skal_med_filtered";
}

function formatLegacyNearby(row: LegacyNearbyShelter, rank: number) {
  const distanceKm = typeof row.distance === "number" ? (row.distance / 1000).toFixed(1) : "n/a";
  const address = row.address || [row.vejnavn, row.husnummer].filter(Boolean).join(" ") || "unknown address";

  return `#${rank} ${address}, ${row.postnummer ?? "unknown postal"} distance=${distanceKm}km capacity=${row.total_capacity ?? "n/a"} anvendelse=${row.anvendelse ?? "unknown"}`;
}

function formatAppV2Nearby(row: AppV2GroupedNearbyShelter, rank: number) {
  const distanceKm = (row.distanceMeters / 1000).toFixed(1);

  return `#${rank} ${row.addressLine1}, ${row.postalCode} ${row.city} distance=${distanceKm}km grouped=${row.shelterCount} capacity=${row.totalCapacity}`;
}

async function analyzeSample(
  sampleName: string,
  sample: CoordinateSample,
  options: Options,
  env: Extract<Env, { ok: true }>,
  anvendelseskoder: Map<string, AnvendelseskodeRow>,
) {
  const [legacyResult, appV2Result] = await Promise.all([
    readLegacyNearbyShelters(
      {
        latitude: sample.latitude,
        longitude: sample.longitude,
        radiusMeters: options.radiusMeters,
      },
      env,
    ),
    getAppV2GroupedNearbySheltersWithDiagnostics({
      latitude: sample.latitude,
      longitude: sample.longitude,
      radiusMeters: options.radiusMeters,
      limit: options.limit,
      candidateLimit: options.candidateLimit,
      importStates: ["active"],
      eligibilityMode: options.eligibilityMode,
    }),
  ]);

  const legacyByKey = new Map<string, { row: LegacyNearbyShelter; rank: number }>();
  const appV2ByKey = new Map<string, { row: AppV2GroupedNearbyShelter; rank: number }>();

  legacyResult.rows.forEach((row, index) => {
    const key = getLegacyAddressKey(row);

    if (key && !legacyByKey.has(key)) {
      legacyByKey.set(key, { row, rank: index + 1 });
    }
  });

  appV2Result.rows.forEach((row, index) => {
    const key = getAppV2AddressKey(row);

    if (key && !appV2ByKey.has(key)) {
      appV2ByKey.set(key, { row, rank: index + 1 });
    }
  });

  const sharedKeys = Array.from(legacyByKey.keys()).filter((key) => appV2ByKey.has(key));
  const legacyOnly = Array.from(legacyByKey.entries()).filter(([key]) => !appV2ByKey.has(key));
  const appV2Only = Array.from(appV2ByKey.entries()).filter(([key]) => !legacyByKey.has(key));
  const appV2OnlyDetails = await Promise.all(
    appV2Only.map(async ([key, entry]) => {
      const legacyMatches = await findLegacyRowsForAppV2Group(entry.row, env);
      const classification = classifyAppV2Only(legacyMatches, anvendelseskoder);

      return {
        key,
        rank: entry.rank,
        row: entry.row,
        legacyMatches,
        classification,
      };
    }),
  );
  const rankDeltas = sharedKeys
    .map((key) => {
      const legacy = legacyByKey.get(key);
      const appV2 = appV2ByKey.get(key);

      if (!legacy || !appV2) {
        throw new Error("Shared key was missing from one side of the rank map.");
      }

      return {
        key,
        legacyRank: legacy.rank,
        appV2Rank: appV2.rank,
        delta: appV2.rank - legacy.rank,
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.legacyRank - b.legacyRank);
  const bucketCounts = appV2OnlyDetails.reduce(
    (counts, detail) => {
      counts[detail.classification] += 1;
      return counts;
    },
    {
      likely_skal_med_filtered: 0,
      legacy_match_still_eligible: 0,
      legacy_match_mixed_semantics: 0,
      no_exact_legacy_address_match: 0,
    } satisfies Record<AppV2OnlyClassification, number>,
  );

  return {
    sampleName,
    sample,
    legacyRpcName: legacyResult.rpcName,
    legacyRows: legacyResult.rows,
    appV2Rows: appV2Result.rows,
    diagnostics: appV2Result.diagnostics,
    sharedKeys,
    legacyOnly,
    appV2OnlyDetails,
    rankDeltas,
    bucketCounts,
  };
}

function printExamples<T>(title: string, rows: T[], limit: number, format: (row: T) => string) {
  console.log(`${title}: ${rows.length}`);

  if (rows.length === 0) {
    console.log("  none");
    return;
  }

  for (const row of rows.slice(0, limit)) {
    console.log(`  - ${format(row)}`);
  }

  if (rows.length > limit) {
    console.log(`  ... ${rows.length - limit} more`);
  }
}

async function main() {
  if (hasFlag("--help")) {
    printHelp();
    return;
  }

  const options = getOptions();
  const env = getEnv();

  console.log("[read:nearby-semantic-cases] read-only nearby semantic mismatch analysis");
  console.log(
    `[read:nearby-semantic-cases] sample=${options.sample} radius=${options.radiusMeters} limit=${options.limit} candidateLimit=${options.candidateLimit} eligibility=${options.eligibilityMode}`,
  );
  console.log(
    "[read:nearby-semantic-cases] matching rule: app_v2-only groups are annotated through exact normalized address + postal lookup in legacy sheltersv2; no fuzzy matching.",
  );

  if (!env.ok) {
    console.log(`[read:nearby-semantic-cases] skipped: missing env vars: ${env.missing.join(", ")}`);
    return;
  }

  const anvendelseskoder = await readAnvendelseskoder(env);
  const selectedSamples: Array<[string, CoordinateSample]> =
    options.sample === "all"
      ? Object.entries(coordinateSamples)
      : [[options.sample, coordinateSamples[options.sample as keyof typeof coordinateSamples]]];
  const results = [];

  for (const [sampleName, sample] of selectedSamples) {
    results.push(await analyzeSample(sampleName, sample, options, env, anvendelseskoder));
  }

  const totals = results.reduce(
    (sum, result) => {
      sum.shared += result.sharedKeys.length;
      sum.legacyOnly += result.legacyOnly.length;
      sum.appV2Only += result.appV2OnlyDetails.length;
      sum.likelySkalMed += result.bucketCounts.likely_skal_med_filtered;
      sum.stillEligible += result.bucketCounts.legacy_match_still_eligible;
      sum.mixed += result.bucketCounts.legacy_match_mixed_semantics;
      sum.noLegacyMatch += result.bucketCounts.no_exact_legacy_address_match;
      return sum;
    },
    {
      shared: 0,
      legacyOnly: 0,
      appV2Only: 0,
      likelySkalMed: 0,
      stillEligible: 0,
      mixed: 0,
      noLegacyMatch: 0,
    },
  );

  console.log("");
  console.log("[read:nearby-semantic-cases] aggregate");
  console.log(`  samples: ${results.length}`);
  console.log(`  shared grouped addresses: ${totals.shared}`);
  console.log(`  legacy-only grouped addresses: ${totals.legacyOnly}`);
  console.log(`  app_v2-only grouped addresses: ${totals.appV2Only}`);
  console.log(`  app_v2-only likely explained by legacy skal_med/capacity filtering: ${totals.likelySkalMed}`);
  console.log(`  app_v2-only with exact legacy match that still appears legacy-eligible: ${totals.stillEligible}`);
  console.log(`  app_v2-only with mixed legacy semantics at same address: ${totals.mixed}`);
  console.log(`  app_v2-only with no exact legacy address match: ${totals.noLegacyMatch}`);

  for (const result of results) {
    console.log("");
    console.log(`[read:nearby-semantic-cases] ${result.sample.label} (${result.sampleName})`);
    console.log(`  legacy rpc: ${result.legacyRpcName}`);
    console.log(`  legacy=${result.legacyRows.length} app_v2=${result.appV2Rows.length} shared=${result.sharedKeys.length}`);
    console.log(
      `  legacyOnly=${result.legacyOnly.length} appV2Only=${result.appV2OnlyDetails.length} likelySkalMed=${result.bucketCounts.likely_skal_med_filtered} stillEligible=${result.bucketCounts.legacy_match_still_eligible} mixed=${result.bucketCounts.legacy_match_mixed_semantics} noLegacyMatch=${result.bucketCounts.no_exact_legacy_address_match}`,
    );
    console.log(
      `  diagnostics: filteredByEligibility=${result.diagnostics.filteredByEligibility ?? "n/a"} eligibleRows=${result.diagnostics.eligibleRows ?? "n/a"} groupedRows=${result.diagnostics.groupedRows ?? "n/a"} legacyAnvendelse=${result.diagnostics.legacyAnvendelseSemantics ?? "unknown"} sourceApplicationCode=${result.diagnostics.sourceApplicationCodeSemantics ?? "unknown"} sourceCodeRows=${result.diagnostics.sourceApplicationCodeRows ?? "n/a"} sourceCodeUnknownRows=${result.diagnostics.sourceApplicationCodeUnknownRows ?? "n/a"}`,
    );

    printExamples(
      "  legacy-only examples",
      result.legacyOnly,
      options.examples,
      ([, entry]) => formatLegacyNearby(entry.row, entry.rank),
    );
    printExamples(
      "  app_v2-only examples",
      result.appV2OnlyDetails,
      options.examples,
      (detail) => {
        const legacyDescriptions = detail.legacyMatches
          .slice(0, 3)
          .map((row) => describeAnvendelse(row, anvendelseskoder))
          .join(" | ");
        const annotation = legacyDescriptions || "no exact legacy address match";

        return `${formatAppV2Nearby(detail.row, detail.rank)} classification=${detail.classification} legacy=${annotation}`;
      },
    );
    printExamples(
      "  largest shared rank deltas",
      result.rankDeltas,
      options.examples,
      (entry) => `${entry.key} legacyRank=${entry.legacyRank} appV2Rank=${entry.appV2Rank} delta=${entry.delta}`,
    );
  }
}

main().catch((error) => {
  console.error("[read:nearby-semantic-cases] failed");
  console.error(error);
  process.exit(1);
});
