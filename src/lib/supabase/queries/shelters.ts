import { createAppV2PublicClient } from "@/lib/app-v2-public";
import { createAppV2AdminClient } from "@/lib/supabase/app-v2";
import { SupabaseConfigurationError } from "@/lib/supabase/env";
import { isMissingPublicRpcError } from "@/lib/supabase/public-rpc-errors";
import { rankRelatedFromTileMarkers, relatedTilesAround, type RelatedShelterRow } from "@/lib/nearby/related";
import { postgrestMaxRows, readAllPages } from "@/lib/supabase/read-all-pages";
import { cache } from "react";
import {
  getCanonicalShelterSlugs,
  getReadableShelterBaseSlug,
  getShortShelterId,
  getStableShelterSlug,
  isPlausiblePublicSlug,
  isStableShelterSlug,
  readableSlugPostcodes,
  readableSlugShortId,
} from "@/lib/shelter-public-url";
import { getAppV2MunicipalitySummaries } from "./municipalities";
import { getCachedAppV2PublicNearbyTile } from "./nearby";
import { parsePlainPathOwnerRows } from "./plain-path-owner-rows";
import { cachedPerRevision } from "./public-data-cache";
import { normalizeMunicipality, normalizePublicShelter, normalizeShelter, sitemapShelterPageSize } from "./shared";
import type { MunicipalitySummaryRow, PublicShelterRow, ShelterRow } from "./shared";

export type AppV2RelatedShelter = {
  id: string;
  slug: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  capacity: number;
};

export type AppV2SitemapShelterRow = {
  slug: string;
  lastModified?: Date;
};

/**
 * Public sitemap rows from `sitemap_shelter_public` (same rules as map markers / nearby public model).
 */
export async function getAppV2PublicSitemapShelters(): Promise<AppV2SitemapShelterRow[]> {
  const supabase = createAppV2PublicClient();
  const out: AppV2SitemapShelterRow[] = [];
  let from = 0;

  while (true) {
    const to = from + sitemapShelterPageSize - 1;
    const { data, error } = await supabase
      .from("sitemap_shelter_public_v2")
      .select("slug, last_modified")
      .order("slug", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Could not load app_v2 shelters for public sitemap: ${error.message}`);
    }

    const rows = (data ?? []) as Array<{ slug: string; last_modified: string | null }>;

    for (const row of rows) {
      const lastModified = row.last_modified ? new Date(row.last_modified) : undefined;
      out.push({
        slug: row.slug,
        ...(lastModified && !Number.isNaN(lastModified.getTime()) ? { lastModified } : {}),
      });
    }

    if (rows.length < sitemapShelterPageSize) break;
    from += sitemapShelterPageSize;
  }

  return out;
}

export async function getAppV2ShelterBySlug(slug: string) {
  const supabase = createAppV2AdminClient();
  const { data: shelterData, error: shelterError } = await supabase
    .from("shelters")
    .select(
      "id, municipality_id, slug, name, address_line1, postal_code, city, latitude, longitude, capacity, status, accessibility_notes, summary, source_summary, import_state, last_seen_at, last_imported_at, canonical_source_name, canonical_source_reference, source_application_code",
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
    .from("municipality_summary_public_v1")
    .select(
      "municipality_id, code, slug, name, description, region_name, public_registration_count, public_capacity, mapped_registration_count, mapped_capacity, latest_public_import_at",
    )
    .eq("municipality_id", shelter.municipality_id)
    .single();

  if (municipalityError || !municipalityData) {
    throw new Error(`Could not load app_v2 municipality for shelter "${slug}".`);
  }

  const municipality = normalizeMunicipality(municipalityData as MunicipalitySummaryRow);

  return normalizeShelter(shelter, municipality);
}

const readPublicShelterRow = cachedPerRevision("shelter-by-slug", async function readPublicShelterRow(slug: string) {
  const pub = createAppV2PublicClient();
  const { data: shelterData, error: shelterError } = await pub
    .from("shelter_public_v2")
    .select(
      "id, municipality_id, slug, name, address_line1, postal_code, city, latitude, longitude, capacity, accessibility_notes, summary, source_summary, last_seen_at, last_imported_at, source_application_code",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (shelterError) {
    throw new Error(`Could not load public app_v2 shelter "${slug}": ${shelterError.message}`);
  }

  return (shelterData as PublicShelterRow | null) ?? null;
});

export const getAppV2PublicShelterBySlug = cache(async function getAppV2PublicShelterBySlug(slug: string) {
  // Bots try paths no shelter can have; they get not found without a lookup.
  if (!isPlausiblePublicSlug(slug)) return null;
  const shelter = await readPublicShelterRow(slug);
  if (!shelter) return null;

  // The 98 municipalities are read once per data revision, not once per shelter.
  // This stays outside readPublicShelterRow: Next.js skips the data cache for
  // a cached read nested inside another.
  const municipality = (await getAppV2MunicipalitySummaries())
    .find((candidate) => candidate.id === shelter.municipality_id);

  if (!municipality) {
    throw new Error(`Could not load app_v2 municipality for shelter "${slug}".`);
  }

  return normalizePublicShelter(shelter, municipality);
});

type ShelterSlugAliasRow = {
  shelter_id: string;
};

type PublicShelterSlugAliasRow = {
  canonical_slug: string;
};

/** The stable slug an older importer slug now points to, or null. */
const resolvePublicShelterSlugAlias = cachedPerRevision("shelter-slug-alias", async function resolvePublicShelterSlugAlias(slug: string) {
  const publicClient = createAppV2PublicClient();
  const { data: publicAliasData, error: publicAliasError } = await publicClient
    .rpc("resolve_public_shelter_slug_alias_v1", { p_alias_slug: slug })
    .maybeSingle();

  let canonicalSlug: string | null = null;
  if (!publicAliasError) {
    canonicalSlug = (publicAliasData as PublicShelterSlugAliasRow | null)?.canonical_slug ?? null;
  } else if (isMissingPublicRpcError(publicAliasError)) {
    // During a rolling deploy, keep legacy links working with the existing
    // server-only resolver until the allowlisted public RPC migration lands.
    try {
      const admin = createAppV2AdminClient();
      const { data: privateAliasData, error: privateAliasError } = await admin
        .from("shelter_slug_aliases")
        .select("shelter_id")
        .eq("alias_slug", slug)
        .maybeSingle();

      // Without the public RPC and the private table nothing can be resolved.
      // Throw rather than return null, so "no alias" is not cached for a day.
      if (privateAliasError) {
        throw new Error(`Could not resolve public app_v2 shelter alias "${slug}": ${privateAliasError.message}`);
      }
      canonicalSlug = privateAliasData
        ? getStableShelterSlug((privateAliasData as ShelterSlugAliasRow).shelter_id)
        : null;
    } catch (error) {
      if (error instanceof SupabaseConfigurationError) {
        throw new Error(`Could not resolve public app_v2 shelter alias "${slug}": the public resolver is missing.`);
      }
      throw error;
    }
  } else {
    throw new Error(`Could not resolve public app_v2 shelter alias "${slug}": ${publicAliasError.message}`);
  }

  return canonicalSlug;
});

export const resolveAppV2PublicShelter = cache(async function resolveAppV2PublicShelter(slug: string) {
  if (!isPlausiblePublicSlug(slug)) return null;
  const directShelter = await getAppV2PublicShelterBySlug(slug);
  if (directShelter) {
    return {
      shelter: directShelter,
      isAlias: false,
    };
  }

  const canonicalSlug = await resolvePublicShelterSlugAlias(slug);
  if (!canonicalSlug) return null;

  const shelter = await getAppV2PublicShelterBySlug(canonicalSlug);
  if (!shelter) return null;

  return {
    shelter,
    isAlias: true,
  };
});

function normalizeRelatedShelter(row: RelatedShelterRow): AppV2RelatedShelter {
  return {
    id: row.id,
    slug: row.slug,
    addressLine1: row.address_line1,
    postalCode: row.postal_code,
    city: row.city,
    capacity: row.capacity,
  };
}

/** Related registrations are looked for within this distance of the registration. */
const relatedRadiusMeters = 20_000;

type RelatedFallbackInput = {
  shelterId: string;
  municipalityId: string;
  postalCode: string;
  limit: number;
};

/** Same postcode first, then the rest of the municipality. Read once per registration and data revision. */
const readRelatedByPostcodeAndMunicipality = cachedPerRevision("related-shelters", async function readRelatedByPostcodeAndMunicipality(input: RelatedFallbackInput): Promise<AppV2RelatedShelter[]> {
  const { limit } = input;
  const pub = createAppV2PublicClient();
  const select = "id, slug, address_line1, postal_code, city, capacity";

  const [samePostalResult, municipalityResult] = await Promise.all([
    pub
      .from("shelter_public_v2")
      .select(select)
      .eq("municipality_id", input.municipalityId)
      .eq("postal_code", input.postalCode)
      .neq("id", input.shelterId)
      .order("address_line1", { ascending: true })
      .limit(limit),
    pub
      .from("shelter_public_v2")
      .select(select)
      .eq("municipality_id", input.municipalityId)
      .neq("id", input.shelterId)
      .order("postal_code", { ascending: true })
      .order("address_line1", { ascending: true })
      .limit(limit * 2),
  ]);

  if (samePostalResult.error || municipalityResult.error) {
    throw new Error("Could not load related public app_v2 shelter registrations.");
  }

  const related = new Map<string, RelatedShelterRow>();
  for (const row of [...(samePostalResult.data ?? []), ...(municipalityResult.data ?? [])] as RelatedShelterRow[]) {
    related.set(row.id, row);
    if (related.size >= limit) break;
  }

  return Array.from(related.values(), normalizeRelatedShelter);
});

/**
 * Other registrations near this one, closest first (5 October review, point 5).
 *
 * With coordinates they are ranked here, in memory, from the registrations of
 * the registration's own nearby tile and the eight around it. Those tiles are
 * read through the revision cache the tile route fills, so the database is read
 * once per tile and data revision, not once per detail page: the earlier
 * get_nearby_shelters_public_v2 call per page was ~10,000 calls and ~21
 * statement timeouts a day (review of 10 November 2026, M1). The tiles hold the
 * same public registrations as that function (country_marker_public_v2 is
 * shelter_public_v2 with coordinates), so every public registration counts,
 * without the nearby page's eligibility rules.
 *
 * Without coordinates, or with none within 20 km, the old order (same
 * postcode, then the municipality) is used.
 *
 * Not itself wrapped in cachedPerRevision: Next.js skips the data cache for a
 * cached read nested inside another, so the tile reads must be top level.
 */
export async function getAppV2PublicRelatedShelters(input: {
  shelterId: string;
  /** The registration's stable slug, which the tiles identify registrations by. */
  slug: string;
  municipalityId: string;
  postalCode: string;
  latitude?: number | null;
  longitude?: number | null;
  limit?: number;
}): Promise<AppV2RelatedShelter[]> {
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 6);

  if (typeof input.latitude === "number" && typeof input.longitude === "number") {
    const origin = { latitude: input.latitude, longitude: input.longitude };
    const tiles = await Promise.all(
      relatedTilesAround(origin.latitude, origin.longitude)
        .map((tile) => getCachedAppV2PublicNearbyTile(tile.key, tile.bounds)),
    );
    const nearest = rankRelatedFromTileMarkers(
      tiles.flatMap((tile) => tile.markers),
      origin,
      input.slug,
      limit,
      relatedRadiusMeters,
    );
    if (nearest.length > 0) return nearest.map(normalizeRelatedShelter);
  }

  return readRelatedByPostcodeAndMunicipality({
    shelterId: input.shelterId,
    municipalityId: input.municipalityId,
    postalCode: input.postalCode,
    limit,
  });
}

type ReadableShelterRow = {
  id: string;
  slug: string;
  address_line1: string;
  postal_code: string;
  city: string;
  capacity: number;
};

/**
 * Ids of the registrations that own the plain readable path of their address,
 * from the database. Throws when the function is missing or fails.
 */
async function readPlainPathOwnerIds(postalCode: string | null) {
  const pub = createAppV2PublicClient();
  const ids = new Set<string>();
  const pageSize = sitemapShelterPageSize;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await pub
      .rpc("public_plain_path_owner_ids_v1", { p_postal_code: postalCode })
      .range(from, from + pageSize - 1);
    if (error) {
      // The migration is in production, so a missing function is an outage, not "no owners".
      // Throwing keeps the answer out of the data cache, where it would last a revision.
      throw new Error(`Could not read owners of plain readable paths: ${error.message}`);
    }
    const rows = Array.isArray(data) ? data : [];
    for (const id of parsePlainPathOwnerRows(rows)) ids.add(id);
    if (rows.length < pageSize) break;
  }
  return ids;
}

const readPlainPathOwnerIdsInPostcode = cachedPerRevision("plain-path-owners-in-postcode", async function readPlainPathOwnerIdsInPostcode(postalCode: string) {
  return [...(await readPlainPathOwnerIds(postalCode))];
});

/** Ids owning a plain path in the given postcodes. Not itself cached, so it may be called beside other wrapped reads. */
export async function getPlainPathOwnerIdsInPostcodes(postalCodes: string[]) {
  const lists = await Promise.all(postalCodes.map((postalCode) => readPlainPathOwnerIdsInPostcode(postalCode)));
  return new Set(lists.flat());
}

/**
 * The public registrations in a postcode through public_shelters_in_postcode_v1,
 * which finds them by the base table's postcode index. Null while that function
 * does not exist yet (the app can be deployed before its migration), so the
 * caller uses the view instead.
 */
async function readPublicRegistrationsInPostcodeRpc(postalCode: string): Promise<ReadableShelterRow[] | null> {
  const pub = createAppV2PublicClient();
  const rows: ReadableShelterRow[] = [];
  for (let from = 0; ; from += postgrestMaxRows) {
    const { data, error } = await pub
      .rpc("public_shelters_in_postcode_v1", { p_postal_code: postalCode })
      .range(from, from + postgrestMaxRows - 1);
    if (error) {
      if (isMissingPublicRpcError(error)) return null;
      throw new Error(`Could not load public app_v2 shelters in ${postalCode}: ${error.message}`);
    }
    const batch = (Array.isArray(data) ? data : []) as ReadableShelterRow[];
    rows.push(...batch);
    if (batch.length < postgrestMaxRows) return rows;
  }
}

const getPublicRegistrationsInPostcode = cachedPerRevision("registrations-in-postcode", async function getPublicRegistrationsInPostcode(postalCode: string) {
  const pub = createAppV2PublicClient();
  // The largest postcode has under 200 today; pages keep it right past 1000.
  const rows = (await readPublicRegistrationsInPostcodeRpc(postalCode)) ?? await readAllPages<ReadableShelterRow>(
    // Before the migration: the view filters on coalesce(override, base), so this scans every shelter.
    (from, to) => pub
      .from("shelter_public_v2")
      .select("id, slug, address_line1, postal_code, city, capacity")
      .eq("postal_code", postalCode)
      .order("id", { ascending: true })
      .range(from, to),
    `public app_v2 shelters in ${postalCode}`,
  );
  // Read directly: a wrapped read inside this one would skip the data cache.
  const owners = await readPlainPathOwnerIds(postalCode);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    addressLine1: row.address_line1,
    postalCode: row.postal_code,
    city: row.city,
    capacity: row.capacity,
    ownsPlainPath: owners.has(row.id),
  }));
});

/**
 * Finds the registration behind a readable path such as
 * "ryesgade-18-8000-aarhus-c" or "ryesgade-22a-8000-aarhus-c-281be9".
 * Returns its stable slug and canonical readable slug, or null.
 */
export const resolveReadableShelterSlug = cache(async function resolveReadableShelterSlug(slug: string) {
  if (!isPlausiblePublicSlug(slug) || isStableShelterSlug(slug)) return null;
  const shortId = readableSlugShortId(slug);

  for (const postalCode of readableSlugPostcodes(slug)) {
    const registrations = await getPublicRegistrationsInPostcode(postalCode);
    if (registrations.length === 0) continue;
    const canonical = getCanonicalShelterSlugs(registrations);

    const exact = registrations.find((registration) => canonical.get(registration.id) === slug);
    if (exact) return { stableSlug: exact.slug, canonicalSlug: slug };

    if (shortId) {
      const base = slug.slice(0, -(shortId.length + 1));
      const match = registrations.find((registration) =>
        getShortShelterId(registration.id) === shortId && getReadableShelterBaseSlug(registration) === base);
      if (match) return { stableSlug: match.slug, canonicalSlug: canonical.get(match.id)! };
    }
  }
  return null;
});

/** The canonical readable slug for a registration, from the registrations at its address. */
export async function getCanonicalReadableSlug(shelter: { id: string; addressLine1: string; postalCode: string; city: string; capacity: number }) {
  const registrations = await getPublicRegistrationsInPostcode(shelter.postalCode);
  const base = getReadableShelterBaseSlug(shelter);
  const sameAddress = registrations.filter((registration) => getReadableShelterBaseSlug(registration) === base);
  if (!sameAddress.some((registration) => registration.id === shelter.id)) sameAddress.push({ ...shelter, slug: "", ownsPlainPath: false });
  return getCanonicalShelterSlugs(sameAddress).get(shelter.id)!;
}

export type AppV2SitemapReadableShelterRow = {
  path: string;
  lastModified?: Date;
};

/** Sitemap rows with readable detail paths. */
export async function getAppV2PublicSitemapReadableShelters(): Promise<AppV2SitemapReadableShelterRow[]> {
  const pub = createAppV2PublicClient();
  const [sitemapRows, registrations, owners] = await Promise.all([
    getAppV2PublicSitemapShelters(),
    (async () => {
      const out: ReadableShelterRow[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await pub
          .from("shelter_public_v2")
          .select("id, slug, address_line1, postal_code, city, capacity")
          .order("id", { ascending: true })
          .range(from, from + sitemapShelterPageSize - 1);
        if (error) throw new Error(`Could not load app_v2 shelters for readable sitemap paths: ${error.message}`);
        const rows = (data ?? []) as ReadableShelterRow[];
        out.push(...rows);
        if (rows.length < sitemapShelterPageSize) break;
        from += sitemapShelterPageSize;
      }
      return out;
    })(),
    readPlainPathOwnerIds(null),
  ]);

  const canonical = getCanonicalShelterSlugs(registrations.map((row) => ({
    ownsPlainPath: owners.has(row.id),
    id: row.id,
    addressLine1: row.address_line1,
    postalCode: row.postal_code,
    city: row.city,
    capacity: row.capacity,
  })));
  const readableByStable = new Map(registrations.map((row) => [row.slug, canonical.get(row.id)!]));

  return sitemapRows.map((row) => ({
    path: `/beskyttelsesrum/${encodeURIComponent(readableByStable.get(row.slug) ?? row.slug)}`,
    ...(row.lastModified ? { lastModified: row.lastModified } : {}),
  }));
}

const readShelterPathAlias = cachedPerRevision("shelter-path-alias", async function readShelterPathAlias(slug: string) {
  const pub = createAppV2PublicClient();
  const { data, error } = await pub.rpc("resolve_shelter_path_alias_v1", { p_path_slug: slug }).maybeSingle();
  // A missing RPC also throws, so a null answer is never cached for a day.
  if (error) throw new Error(`Could not resolve readable path alias "${slug}": ${error.message}`);
  return (data as { stable_slug: string } | null)?.stable_slug ?? null;
});

/**
 * An earlier readable path of a registration that is still public, from the
 * path history in app_v2. Returns its stable slug, or null.
 */
export const resolveShelterPathAlias = cache(async function resolveShelterPathAlias(slug: string) {
  // Path aliases are earlier readable paths; a stable "registrering-<id>"
  // path is never one, so bots crawling those need no lookup.
  if (!isPlausiblePublicSlug(slug) || isStableShelterSlug(slug)) return null;
  return readShelterPathAlias(slug);
});

export type RetiredShelter = {
  addressLine1: string;
  postalCode: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
};

const readRetiredShelter = cachedPerRevision("retired-shelter", async function readRetiredShelter(slug: string): Promise<RetiredShelter | null> {
  const pub = createAppV2PublicClient();
  const { data, error } = await pub.rpc("resolve_retired_shelter_v1", { p_slug: slug }).maybeSingle();
  // A missing RPC also throws, so a null answer is never cached for a day.
  if (error) throw new Error(`Could not resolve removed registration "${slug}": ${error.message}`);
  const row = data as { address_line1: string; postal_code: string; city: string; latitude: number | string | null; longitude: number | string | null } | null;
  if (!row) return null;
  const toNumber = (value: number | string | null) => (value === null ? null : Number(value));
  return {
    addressLine1: row.address_line1,
    postalCode: row.postal_code,
    city: row.city,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
  };
});

/** The last address of a registration removed from BBR, found by any path it has had. */
export const resolveRetiredShelter = cache(async function resolveRetiredShelter(slug: string): Promise<RetiredShelter | null> {
  if (!isPlausiblePublicSlug(slug)) return null;
  return readRetiredShelter(slug);
});
