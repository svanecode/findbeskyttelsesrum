import { getMunicipalitySlugCandidates } from "@/lib/municipalities/metadata";
import { createAppV2PublicClient } from "@/lib/app-v2-public";
import { cache } from "react";
import { normalizePublicApplicationLabel } from "@/lib/public-labels";
import { normalizeMunicipality } from "./shared";
import type { MunicipalitySummaryRow } from "./shared";

export async function getAppV2MunicipalitySummaries() {
  const supabase = createAppV2PublicClient();
  const { data, error } = await supabase
    .from("municipality_summary_public_v1")
    .select(
      "municipality_id, code, slug, name, description, region_name, public_registration_count, public_capacity, mapped_registration_count, mapped_capacity, latest_public_import_at",
    )
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Could not load app_v2 municipalities.");
  }

  return ((data ?? []) as MunicipalitySummaryRow[]).map(normalizeMunicipality);
}

export async function getAppV2MunicipalitySlugs() {
  const supabase = createAppV2PublicClient();
  const { data, error } = await supabase
    .from("municipality_summary_public_v1")
    .select("slug")
    .order("slug", { ascending: true });

  if (error) {
    throw new Error("Could not load app_v2 municipality slugs.");
  }

  return ((data ?? []) as Array<{ slug: string }>).map((row) => row.slug);
}

export async function getAppV2PublicMunicipalitySummaryCount() {
  const supabase = createAppV2PublicClient();
  const { count, error } = await supabase
    .from("municipality_summary_public_v1")
    .select("municipality_id", { count: "exact", head: true });

  if (error) {
    throw new Error(`Could not count app_v2 public municipality summaries: ${error.message}`);
  }

  return count ?? 0;
}

export const getAppV2MunicipalityBySlug = cache(async function getAppV2MunicipalityBySlug(slug: string) {
  const supabase = createAppV2PublicClient();
  const slugCandidates = getMunicipalitySlugCandidates(slug);
  const { data, error } = await supabase
    .from("municipality_summary_public_v1")
    .select(
      "municipality_id, code, slug, name, description, region_name, public_registration_count, public_capacity, mapped_registration_count, mapped_capacity, latest_public_import_at",
    )
    .in("slug", slugCandidates)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load app_v2 municipality "${slug}".`);
  }

  if (!data) {
    return null;
  }

  return normalizeMunicipality(data as MunicipalitySummaryRow);
});

// ─── Municipality shelter list + grouping (Sprint 5) ────────────────────────

export type AppV2MunicipalityShelter = {
  id: string;
  slug: string;
  name: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  capacity: number;
  sourceApplicationCode: string | null;
  applicationCodeLabel: string | null;
};

export type AppV2MunicipalityShelterGroup = {
  groupKey: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  shelterCount: number;
  totalCapacity: number;
  slugs: string[];
  primarySlug: string;
  applicationCodeLabel: string | null;
  applicationCodeLabels: string[];
  shelters: Array<Pick<AppV2MunicipalityShelter, "id" | "slug" | "name" | "capacity">>;
};

type MunicipalityShelterRow = {
  id: string;
  slug: string;
  name: string;
  address_line1: string;
  postal_code: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  capacity: number;
  source_application_code: string | null;
};

export async function getAppV2PublicMunicipalityShelters(
  municipalityId: string,
): Promise<AppV2MunicipalityShelter[]> {
  const pub = createAppV2PublicClient();
  const pageSize = 1000;
  const allRows: MunicipalityShelterRow[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await pub
      .from("shelter_public_v2")
      .select(
        "id, slug, name, address_line1, postal_code, city, latitude, longitude, capacity, source_application_code",
      )
      .eq("municipality_id", municipalityId)
      .order("address_line1", { ascending: true })
      .order("postal_code", { ascending: true })
      .order("capacity", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(
        `Could not load app_v2 municipality shelters for "${municipalityId}": ${error.message}`,
      );
    }

    const rows = (data ?? []) as MunicipalityShelterRow[];
    allRows.push(...rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  const uniqueCodes = Array.from(
    new Set(allRows.map((r) => r.source_application_code).filter((c): c is string => c !== null)),
  );
  const labelByCode = new Map<string, string>();
  if (uniqueCodes.length > 0) {
    const publicClient = createAppV2PublicClient();
    const { data: labelRows, error: labelError } = await publicClient
      .from("application_code_public")
      .select("application_code, label")
      .in("application_code", uniqueCodes);
    if (labelError) {
      throw new Error(`Could not load app_v2 application code labels: ${labelError.message}`);
    }
    for (const row of (labelRows ?? []) as Array<{ application_code: string; label: string | null }>) {
      if (row.label) labelByCode.set(row.application_code, normalizePublicApplicationLabel(row.label));
    }
  }

  return allRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    addressLine1: row.address_line1,
    postalCode: row.postal_code,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    capacity: row.capacity,
    sourceApplicationCode: row.source_application_code,
    applicationCodeLabel: row.source_application_code ? (labelByCode.get(row.source_application_code) ?? null) : null,
  }));
}

export function groupMunicipalityShelters(
  shelters: AppV2MunicipalityShelter[],
): AppV2MunicipalityShelterGroup[] {
  const groups = new Map<string, AppV2MunicipalityShelter[]>();

  for (const shelter of shelters) {
    const key =
      shelter.addressLine1.toLowerCase().trim() + "|" + shelter.postalCode.trim();
    groups.set(key, [...(groups.get(key) ?? []), shelter]);
  }

  return Array.from(groups.entries())
    .map(([groupKey, groupShelters]) => {
      // Primary shelter = highest capacity (already sorted desc from query)
      const primary = [...groupShelters].sort((a, b) => b.capacity - a.capacity)[0]!;

      const applicationCodeLabels = Array.from(new Set(
        groupShelters
          .map((shelter) => shelter.applicationCodeLabel)
          .filter((label): label is string => Boolean(label)),
      )).sort((a, b) => a.localeCompare(b, "da-DK"));

      return {
        groupKey,
        addressLine1: primary.addressLine1,
        postalCode: primary.postalCode,
        city: primary.city,
        latitude: primary.latitude,
        longitude: primary.longitude,
        shelterCount: groupShelters.length,
        totalCapacity: groupShelters.reduce((sum, s) => sum + s.capacity, 0),
        slugs: groupShelters.map((s) => s.slug),
        primarySlug: primary.slug,
        applicationCodeLabel: applicationCodeLabels.length > 1
          ? "Flere registrerede bygningsanvendelser"
          : (applicationCodeLabels[0] ?? null),
        applicationCodeLabels,
        shelters: groupShelters.map(({ id, slug, name, capacity }) => ({ id, slug, name, capacity })),
      };
    })
    .sort((a, b) =>
      a.addressLine1.localeCompare(b.addressLine1, "da-DK") ||
      a.postalCode.localeCompare(b.postalCode),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
