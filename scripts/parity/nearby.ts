import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import {
  getAppV2NearbyShelters,
  type AppV2ImportState,
  type AppV2NearbyShelter,
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
  latitude: number;
  longitude: number;
  radiusMeters: number;
  limit: number;
  candidateLimit: number;
  includeSuppressed: boolean;
};

const defaultOptions: NearbyParityOptions = {
  latitude: 55.6761,
  longitude: 12.5683,
  radiusMeters: 50_000,
  limit: 10,
  candidateLimit: 500,
  includeSuppressed: false,
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

function getOptions(): NearbyParityOptions {
  return {
    latitude: parseNumberFlag("--lat", defaultOptions.latitude),
    longitude: parseNumberFlag("--lng", defaultOptions.longitude),
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

function getLegacyAddressKey(row: LegacyNearbyShelter) {
  return normalizeText(
    row.address || [row.vejnavn, row.husnummer, row.postnummer].filter(Boolean).join(" "),
  );
}

function getAppV2AddressKey(row: AppV2NearbyShelter) {
  return normalizeText([row.addressLine1, row.postalCode, row.city].filter(Boolean).join(" "));
}

function formatLegacyRow(row: LegacyNearbyShelter) {
  const distanceKm = ((row.distance ?? 0) / 1000).toFixed(1);
  const address = row.address || [row.vejnavn, row.husnummer].filter(Boolean).join(" ") || "unknown address";

  return `${address}, ${row.postnummer ?? "unknown postal"} | distance=${distanceKm}km groupedCount=${row.shelter_count ?? "n/a"} capacity=${row.total_capacity ?? "n/a"} id=${row.id}`;
}

function formatAppV2Row(row: AppV2NearbyShelter) {
  const distanceKm = (row.distanceMeters / 1000).toFixed(1);

  return `${row.addressLine1}, ${row.postalCode} ${row.city} | distance=${distanceKm}km capacity=${row.capacity} municipality=${row.municipality.name} id=${row.id}`;
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

async function main() {
  console.log("[parity:nearby] read-only legacy/app_v2 nearby parity check");

  const options = getOptions();
  const env = getEnv();

  console.log(
    `[parity:nearby] input lat=${options.latitude} lng=${options.longitude} radiusMeters=${options.radiusMeters} limit=${options.limit} candidateLimit=${options.candidateLimit}`,
  );
  console.log(`[parity:nearby] app_v2 import states: ${getAppV2ImportStates(options).join(", ")}`);
  console.log(
    "[parity:nearby] note: legacy nearby is grouped by address/location; app_v2 nearby currently returns one shelter row per result.",
  );
  console.log(
    "[parity:nearby] note: app_v2 excludes suppressed shelters by default through import_state and filters active app_v2 shelter_exclusions by shelter/source identity.",
  );
  console.log(
    "[parity:nearby] note: legacy public.excluded_shelters address and bygning_id matching is not mirrored yet.",
  );

  if (!env.ok) {
    console.log(`[parity:nearby] skipped: missing env vars: ${env.missing.join(", ")}`);
    console.log("[parity:nearby] no database reads were attempted.");
    return;
  }

  const [legacyResult, appV2Rows] = await Promise.all([
    readLegacyNearbyShelters(options, env),
    getAppV2NearbyShelters({
      latitude: options.latitude,
      longitude: options.longitude,
      radiusMeters: options.radiusMeters,
      limit: options.limit,
      candidateLimit: options.candidateLimit,
      importStates: getAppV2ImportStates(options),
    }),
  ]);

  const legacyRows = legacyResult.rows;
  const legacyAddressKeys = new Set(legacyRows.map(getLegacyAddressKey).filter(Boolean));
  const appV2AddressKeys = new Set(appV2Rows.map(getAppV2AddressKey).filter(Boolean));
  const sharedAddressKeys = Array.from(legacyAddressKeys).filter((key) => appV2AddressKeys.has(key));
  const legacyOnlyAddressKeys = Array.from(legacyAddressKeys).filter((key) => !appV2AddressKeys.has(key));
  const appV2OnlyAddressKeys = Array.from(appV2AddressKeys).filter((key) => !legacyAddressKeys.has(key));
  const legacyIds = new Set(legacyRows.map((row) => row.id));
  const appV2Ids = new Set(appV2Rows.map((row) => row.id));
  const sharedIds = Array.from(legacyIds).filter((id) => appV2Ids.has(id));

  console.log(`[parity:nearby] legacy rpc: ${legacyResult.rpcName}`);
  console.log(`[parity:nearby] legacy result count: ${legacyRows.length}`);
  console.log(`[parity:nearby] app_v2 result count: ${appV2Rows.length}`);
  console.log(`[parity:nearby] shared ids: ${sharedIds.length}`);
  console.log(`[parity:nearby] shared address keys: ${sharedAddressKeys.length}`);
  console.log(`[parity:nearby] legacy-only address keys: ${legacyOnlyAddressKeys.length}`);
  console.log(`[parity:nearby] app_v2-only address keys: ${appV2OnlyAddressKeys.length}`);
  console.log("");

  printSamples("legacy top results", legacyRows.map(formatLegacyRow));
  console.log("");
  printSamples("app_v2 top results", appV2Rows.map(formatAppV2Row));
  console.log("");
  printSamples("shared address keys", sharedAddressKeys);
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
