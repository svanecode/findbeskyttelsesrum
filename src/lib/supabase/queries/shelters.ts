import { createAppV2PublicClient } from "@/lib/app-v2-public";
import { createAppV2AdminClient } from "@/lib/supabase/app-v2";
import { SupabaseConfigurationError } from "@/lib/supabase/env";
import { isMissingPublicRpcError } from "@/lib/supabase/public-rpc-errors";
import { cache } from "react";
import { getStableShelterSlug } from "@/lib/shelter-public-url";
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

export const getAppV2PublicShelterBySlug = cache(async function getAppV2PublicShelterBySlug(slug: string) {
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

  if (!shelterData) {
    return null;
  }

  const shelter = shelterData as PublicShelterRow;
  const { data: municipalityData, error: municipalityError } = await pub
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

  return normalizePublicShelter(shelter, municipality);
});

type ShelterSlugAliasRow = {
  shelter_id: string;
};

type PublicShelterSlugAliasRow = {
  canonical_slug: string;
};

export const resolveAppV2PublicShelter = cache(async function resolveAppV2PublicShelter(slug: string) {
  const directShelter = await getAppV2PublicShelterBySlug(slug);
  if (directShelter) {
    return {
      shelter: directShelter,
      isAlias: false,
    };
  }

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

      if (privateAliasError) {
        if (privateAliasError.code === "PGRST205" || privateAliasError.code === "42P01") return null;
        throw new Error(`Could not resolve public app_v2 shelter alias "${slug}".`);
      }
      canonicalSlug = privateAliasData
        ? getStableShelterSlug((privateAliasData as ShelterSlugAliasRow).shelter_id)
        : null;
    } catch (error) {
      if (error instanceof SupabaseConfigurationError) return null;
      throw error;
    }
  } else {
    throw new Error(`Could not resolve public app_v2 shelter alias "${slug}".`);
  }

  if (!canonicalSlug) return null;

  const shelter = await getAppV2PublicShelterBySlug(canonicalSlug);
  if (!shelter) return null;

  return {
    shelter,
    isAlias: true,
  };
});

type RelatedShelterRow = {
  id: string;
  slug: string;
  address_line1: string;
  postal_code: string;
  city: string;
  capacity: number;
};

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

export async function getAppV2PublicRelatedShelters(input: {
  shelterId: string;
  municipalityId: string;
  postalCode: string;
  limit?: number;
}): Promise<AppV2RelatedShelter[]> {
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 6);
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
}
