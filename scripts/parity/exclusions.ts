import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

type LegacyExcludedShelterRow = {
  id: string;
  address: string;
  vejnavn: string | null;
  husnummer: string | null;
  postnummer: string | null;
  bygning_id: string | null;
  reason: string | null;
  created_at: string | null;
  created_by: string | null;
};

type AppV2ShelterRow = {
  id: string;
  slug: string;
  name: string;
  address_line1: string;
  postal_code: string;
  city: string;
  import_state: string;
  canonical_source_name: string | null;
  canonical_source_reference: string | null;
};

type AppV2ShelterExclusionRow = {
  id: string;
  is_active: boolean;
  shelter_id: string | null;
  canonical_source_name: string | null;
  canonical_source_reference: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  legacy_bygning_id: string | null;
};

type SupabaseParityEnv =
  | {
      ok: true;
      url: string;
      secretKey: string;
    }
  | {
      ok: false;
      missing: string[];
    };

type MatchCandidate = {
  legacy: LegacyExcludedShelterRow;
  matches: AppV2ShelterRow[];
};

const sampleLimit = 10;

function getSupabaseEnv(): SupabaseParityEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !secretKey) {
    const missing = [
      ["NEXT_PUBLIC_SUPABASE_URL", url],
      ["SUPABASE_SECRET_KEY", secretKey],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name as string);

    return { ok: false, missing };
  }

  return { ok: true, url, secretKey };
}

function createSupabaseClient(url: string, secretKey: string, schema: "public" | "app_v2") {
  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema,
    },
  });
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

function getLegacyFullAddressKey(row: LegacyExcludedShelterRow) {
  return normalizeAddressKey(row.address);
}

function getLegacySplitAddressKey(row: LegacyExcludedShelterRow) {
  return normalizeAddressKey([row.vejnavn, row.husnummer, row.postnummer].filter(Boolean).join(" "));
}

function getAppV2FullAddressKey(row: AppV2ShelterRow) {
  return normalizeAddressKey([row.address_line1, row.postal_code, row.city].filter(Boolean).join(" "));
}

function getAppV2AddressWithoutCityKey(row: AppV2ShelterRow) {
  return normalizeAddressKey([row.address_line1, row.postal_code].filter(Boolean).join(" "));
}

function getUniqueMatches(rows: AppV2ShelterRow[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

function findMatchesByKey(
  legacyRows: LegacyExcludedShelterRow[],
  appV2Rows: AppV2ShelterRow[],
  getLegacyKey: (row: LegacyExcludedShelterRow) => string,
  getAppV2Key: (row: AppV2ShelterRow) => string,
) {
  const appV2RowsByKey = new Map<string, AppV2ShelterRow[]>();

  for (const row of appV2Rows) {
    const key = getAppV2Key(row);

    if (!key) {
      continue;
    }

    appV2RowsByKey.set(key, [...(appV2RowsByKey.get(key) ?? []), row]);
  }

  return legacyRows
    .map((legacy) => {
      const key = getLegacyKey(legacy);
      const matches = key ? appV2RowsByKey.get(key) ?? [] : [];

      return matches.length > 0 ? { legacy, matches } : null;
    })
    .filter((match): match is MatchCandidate => Boolean(match));
}

async function readLegacyExclusions(url: string, secretKey: string) {
  const supabase = createSupabaseClient(url, secretKey, "public");
  const { data, error } = await supabase
    .from("excluded_shelters")
    .select("id, address, vejnavn, husnummer, postnummer, bygning_id, reason, created_at, created_by")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Could not read legacy public.excluded_shelters: ${error.message}`);
  }

  return (data ?? []) as LegacyExcludedShelterRow[];
}

async function readAppV2Shelters(url: string, secretKey: string) {
  const supabase = createSupabaseClient(url, secretKey, "app_v2");
  const { data, error } = await supabase
    .from("shelters")
    .select(
      "id, slug, name, address_line1, postal_code, city, import_state, canonical_source_name, canonical_source_reference",
    )
    .order("slug");

  if (error) {
    throw new Error(`Could not read app_v2.shelters: ${error.message}`);
  }

  return (data ?? []) as AppV2ShelterRow[];
}

async function readExistingAppV2Exclusions(url: string, secretKey: string) {
  const supabase = createSupabaseClient(url, secretKey, "app_v2");
  const { data, error } = await supabase
    .from("shelter_exclusions")
    .select(
      "id, is_active, shelter_id, canonical_source_name, canonical_source_reference, address_line1, postal_code, city, legacy_bygning_id",
    );

  if (error) {
    console.log(`[parity:exclusions] warning: could not read app_v2.shelter_exclusions: ${error.message}`);
    return null;
  }

  return (data ?? []) as AppV2ShelterExclusionRow[];
}

function printCandidates(title: string, candidates: MatchCandidate[], formatter: (candidate: MatchCandidate) => string) {
  console.log(`${title}: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("  none");
    return;
  }

  for (const candidate of candidates.slice(0, sampleLimit)) {
    console.log(`  - ${formatter(candidate)}`);
  }

  if (candidates.length > sampleLimit) {
    console.log(`  ... ${candidates.length - sampleLimit} more`);
  }
}

function formatLegacy(row: LegacyExcludedShelterRow) {
  const splitAddress = [row.vejnavn, row.husnummer, row.postnummer].filter(Boolean).join(" ");
  const building = row.bygning_id ? ` bygning_id=${row.bygning_id}` : "";

  return `legacy=${row.address}${splitAddress ? ` split=${splitAddress}` : ""}${building}`;
}

function formatAppV2(row: AppV2ShelterRow) {
  const source = row.canonical_source_reference
    ? ` source=${row.canonical_source_name ?? "unknown"}:${row.canonical_source_reference}`
    : "";

  return `${row.slug} ${row.address_line1}, ${row.postal_code} ${row.city} import_state=${row.import_state}${source}`;
}

function formatCandidate(candidate: MatchCandidate) {
  return `${formatLegacy(candidate.legacy)} -> ${candidate.matches.length} match(es): ${candidate.matches
    .slice(0, 3)
    .map(formatAppV2)
    .join(" | ")}`;
}

function getLegacyRowsWithoutMatches(legacyRows: LegacyExcludedShelterRow[], matchGroups: MatchCandidate[][]) {
  const matchedIds = new Set(matchGroups.flat().map((candidate) => candidate.legacy.id));

  return legacyRows.filter((row) => !matchedIds.has(row.id));
}

function getUniqueLegacyCount(matchGroups: MatchCandidate[][]) {
  return new Set(matchGroups.flat().map((candidate) => candidate.legacy.id)).size;
}

function getStrongestMatchBuckets(input: {
  legacyRows: LegacyExcludedShelterRow[];
  sourceReferenceMatches: MatchCandidate[];
  fullAddressMatches: MatchCandidate[];
  splitAddressMatches: MatchCandidate[];
}) {
  const sourceReferenceIds = new Set(input.sourceReferenceMatches.map((candidate) => candidate.legacy.id));
  const fullAddressOnly = input.fullAddressMatches.filter((candidate) => !sourceReferenceIds.has(candidate.legacy.id));
  const sourceOrFullAddressIds = new Set([
    ...Array.from(sourceReferenceIds),
    ...fullAddressOnly.map((candidate) => candidate.legacy.id),
  ]);
  const splitAddressOnly = input.splitAddressMatches.filter(
    (candidate) => !sourceOrFullAddressIds.has(candidate.legacy.id),
  );
  const unresolved = input.legacyRows.filter((row) => !sourceOrFullAddressIds.has(row.id) && !splitAddressOnly.some((candidate) => candidate.legacy.id === row.id));

  return {
    sourceReference: input.sourceReferenceMatches,
    fullAddressOnly,
    splitAddressOnly,
    unresolved,
  };
}

async function main() {
  console.log("[parity:exclusions] read-only legacy excluded_shelters/app_v2 mapping check");

  const env = getSupabaseEnv();

  if (!env.ok) {
    console.log(`[parity:exclusions] skipped: missing env vars: ${env.missing.join(", ")}`);
    console.log("[parity:exclusions] no database reads were attempted.");
    return;
  }

  const [legacyRows, appV2Rows, existingAppV2Exclusions] = await Promise.all([
    readLegacyExclusions(env.url, env.secretKey),
    readAppV2Shelters(env.url, env.secretKey),
    readExistingAppV2Exclusions(env.url, env.secretKey),
  ]);
  const appV2BySourceReference = new Map<string, AppV2ShelterRow[]>();

  for (const row of appV2Rows) {
    if (!row.canonical_source_reference) {
      continue;
    }

    appV2BySourceReference.set(row.canonical_source_reference, [
      ...(appV2BySourceReference.get(row.canonical_source_reference) ?? []),
      row,
    ]);
  }

  const sourceReferenceMatches = legacyRows
    .map((legacy) => {
      const matches = legacy.bygning_id ? appV2BySourceReference.get(legacy.bygning_id) ?? [] : [];

      return matches.length > 0 ? { legacy, matches: getUniqueMatches(matches) } : null;
    })
    .filter((match): match is MatchCandidate => Boolean(match));
  const fullAddressMatches = findMatchesByKey(
    legacyRows,
    appV2Rows,
    getLegacyFullAddressKey,
    getAppV2FullAddressKey,
  );
  const splitAddressMatches = findMatchesByKey(
    legacyRows,
    appV2Rows,
    getLegacySplitAddressKey,
    getAppV2AddressWithoutCityKey,
  );
  const unresolvedLegacyRows = getLegacyRowsWithoutMatches(legacyRows, [
    sourceReferenceMatches,
    fullAddressMatches,
    splitAddressMatches,
  ]);
  const ambiguousCandidates = [...sourceReferenceMatches, ...fullAddressMatches, ...splitAddressMatches].filter(
    (candidate) => candidate.matches.length > 1,
  );
  const existingActiveAppV2Exclusions = existingAppV2Exclusions?.filter((row) => row.is_active).length ?? null;
  const existingAppV2ExclusionsWithShelterId =
    existingAppV2Exclusions?.filter((row) => row.is_active && row.shelter_id).length ?? null;
  const existingAppV2ExclusionsWithSourceIdentity =
    existingAppV2Exclusions?.filter(
      (row) => row.is_active && row.canonical_source_name && row.canonical_source_reference,
    ).length ?? null;
  const existingAppV2ExclusionsWithAddress =
    existingAppV2Exclusions?.filter((row) => row.is_active && row.address_line1 && row.postal_code).length ?? null;
  const existingAppV2ExclusionsWithLegacyBuildingId =
    existingAppV2Exclusions?.filter((row) => row.is_active && row.legacy_bygning_id).length ?? null;
  const strongestBuckets = getStrongestMatchBuckets({
    legacyRows,
    sourceReferenceMatches,
    fullAddressMatches,
    splitAddressMatches,
  });

  console.log(`[parity:exclusions] legacy exclusions: ${legacyRows.length}`);
  console.log(`[parity:exclusions] app_v2 shelters scanned: ${appV2Rows.length}`);
  console.log(
    `[parity:exclusions] app_v2 shelter_exclusions: ${
      existingAppV2Exclusions === null
        ? "not readable"
        : `${existingAppV2Exclusions.length} total, ${existingActiveAppV2Exclusions} active`
    }`,
  );
  if (existingAppV2Exclusions !== null) {
    console.log(
      `[parity:exclusions] active app_v2 exclusion identities: shelter_id=${existingAppV2ExclusionsWithShelterId} source=${existingAppV2ExclusionsWithSourceIdentity} address=${existingAppV2ExclusionsWithAddress} legacy_bygning_id=${existingAppV2ExclusionsWithLegacyBuildingId}`,
    );
  }
  console.log("");
  console.log(
    "[parity:exclusions] note: source-reference matches are strong candidates only if legacy bygning_id and app_v2 canonical_source_reference use the same source identity.",
  );
  console.log(
    "[parity:exclusions] note: address matches lowercase, trim, collapse whitespace, and treat commas as separators; they do not use fuzzy typo matching.",
  );
  console.log("");

  console.log("[parity:exclusions] strongest-match decision buckets");
  console.log(`  strong source-reference candidates: ${strongestBuckets.sourceReference.length}`);
  console.log(`  address-only candidates after source matches: ${strongestBuckets.fullAddressOnly.length}`);
  console.log(`  split-address-only candidates after stronger matches: ${strongestBuckets.splitAddressOnly.length}`);
  console.log(`  unresolved legacy exclusions: ${strongestBuckets.unresolved.length}`);
  console.log(`  ambiguous candidate rows: ${ambiguousCandidates.length}`);
  console.log(
    `  unique legacy exclusions with any candidate: ${getUniqueLegacyCount([
      sourceReferenceMatches,
      fullAddressMatches,
      splitAddressMatches,
    ])}`,
  );
  console.log("");

  printCandidates("strong candidate: legacy bygning_id to app_v2 canonical_source_reference", sourceReferenceMatches, formatCandidate);
  console.log("");
  printCandidates("potential: legacy address to app_v2 full address", fullAddressMatches, formatCandidate);
  console.log("");
  printCandidates("potential: legacy split address to app_v2 address/postal", splitAddressMatches, formatCandidate);
  console.log("");
  printCandidates("manual review: ambiguous candidates", ambiguousCandidates, formatCandidate);
  console.log("");

  console.log(`unresolved legacy exclusions: ${unresolvedLegacyRows.length}`);

  if (unresolvedLegacyRows.length === 0) {
    console.log("  none");
  } else {
    for (const row of unresolvedLegacyRows.slice(0, sampleLimit)) {
      console.log(`  - ${formatLegacy(row)}`);
    }

    if (unresolvedLegacyRows.length > sampleLimit) {
      console.log(`  ... ${unresolvedLegacyRows.length - sampleLimit} more`);
    }
  }

  console.log("");
  console.log("[parity:exclusions] result: read-only report only; no writes or migrations were attempted.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown exclusions parity error.";

  console.error(`[parity:exclusions] failed: ${message}`);
  process.exit(1);
});
