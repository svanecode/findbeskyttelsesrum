import { createAppV2PublicClient } from "@/lib/app-v2-public";
import { getBoolean, getInteger, getNullableString, getNumber, getString, isRecord, sitemapShelterPageSize } from "./shared";

export type AppV2CountryShelterMarker = {
  slug: string;
  name: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  capacity: number;
  sourceApplicationCode: string | null;
  latitude: number;
  longitude: number;
};

export type AppV2CountryMapCluster = {
  kind: "cluster";
  id: string;
  latitude: number;
  longitude: number;
  north: number;
  south: number;
  east: number;
  west: number;
  count: number;
  capacity: number;
};

export type AppV2CountryMapMarkerFeature = AppV2CountryShelterMarker & {
  kind: "marker";
};

export type AppV2CountryMapFeature = AppV2CountryMapMarkerFeature | AppV2CountryMapCluster;

export type AppV2CountryMapFeatureResult = {
  features: AppV2CountryMapFeature[];
  mode: "clusters" | "markers";
  availableCount: number;
  featureCount: number;
  markerCount: number;
  clusterCount: number;
  clusteredRegistrationCount: number;
  truncated: boolean;
};

type CountryShelterMarkerRow = {
  id: string;
  slug: string;
  name: string;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  capacity: number | string | null;
  source_application_code: string | null;
};

function normalizeCountryShelterMarker(row: CountryShelterMarkerRow): AppV2CountryShelterMarker | null {
  const latitude = row.latitude === null || row.latitude === undefined ? Number.NaN : Number(row.latitude);
  const longitude = row.longitude === null || row.longitude === undefined ? Number.NaN : Number(row.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const capacityValue =
    row.capacity === null || row.capacity === undefined ? Number.NaN : Number(row.capacity);
  const capacity = Number.isFinite(capacityValue) ? Math.trunc(capacityValue) : 0;

  const addressLine1 = (row.address_line1 ?? "").trim();
  const postalCode = (row.postal_code ?? "").trim();
  const city = (row.city ?? "").trim();

  return {
    slug: row.slug,
    name: row.name,
    addressLine1,
    postalCode,
    city,
    capacity,
    sourceApplicationCode: row.source_application_code,
    latitude,
    longitude,
  };
}

/**
 * Paginated read of public map markers (national map / sanity), from `country_marker_public`.
 */
export type AppV2CountryShelterMarkerBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type AppV2CountryMapFeatureRequest = AppV2CountryShelterMarkerBounds & {
  zoom: number;
  limit?: number;
};

function normalizeCountryMapFeature(value: unknown): AppV2CountryMapFeature {
  if (!isRecord(value)) {
    throw new Error("Country map RPC returned an invalid feature.");
  }

  if (value.kind === "cluster") {
    return {
      kind: "cluster",
      id: getString(value.id, "country-map cluster id"),
      latitude: getNumber(value.latitude, "country-map cluster latitude"),
      longitude: getNumber(value.longitude, "country-map cluster longitude"),
      north: getNumber(value.north, "country-map cluster north"),
      south: getNumber(value.south, "country-map cluster south"),
      east: getNumber(value.east, "country-map cluster east"),
      west: getNumber(value.west, "country-map cluster west"),
      count: getInteger(value.count, "country-map cluster count"),
      capacity: getInteger(value.capacity, "country-map cluster capacity"),
    };
  }

  if (value.kind !== "marker") {
    throw new Error("Country map RPC returned an unknown feature kind.");
  }

  return {
    kind: "marker",
    slug: getString(value.slug, "country-map marker slug"),
    name: getString(value.name, "country-map marker name"),
    addressLine1: getString(value.addressLine1, "country-map marker addressLine1"),
    postalCode: getString(value.postalCode, "country-map marker postalCode"),
    city: getString(value.city, "country-map marker city"),
    capacity: getInteger(value.capacity, "country-map marker capacity"),
    sourceApplicationCode: getNullableString(
      value.sourceApplicationCode,
      "country-map marker sourceApplicationCode",
    ),
    latitude: getNumber(value.latitude, "country-map marker latitude"),
    longitude: getNumber(value.longitude, "country-map marker longitude"),
  };
}

export async function getAppV2PublicCountryMapFeatures(
  request: AppV2CountryMapFeatureRequest,
): Promise<AppV2CountryMapFeatureResult> {
  const supabase = createAppV2PublicClient();
  const { data, error } = await supabase.rpc("get_country_map_features_public_v1", {
    p_north: request.north,
    p_south: request.south,
    p_east: request.east,
    p_west: request.west,
    p_zoom: request.zoom,
    p_limit: request.limit ?? 5000,
  });

  if (error) {
    throw new Error(`Could not load app_v2 country map features: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!isRecord(row) || !Array.isArray(row.features) || !isRecord(row.diagnostics)) {
    throw new Error("Country map RPC returned an invalid response.");
  }

  const mode = row.diagnostics.mode;
  if (mode !== "clusters" && mode !== "markers") {
    throw new Error("Country map RPC returned an invalid mode.");
  }

  return {
    features: row.features.map(normalizeCountryMapFeature),
    mode,
    availableCount: getInteger(row.diagnostics.availableCount, "country-map availableCount"),
    featureCount: getInteger(row.diagnostics.featureCount, "country-map featureCount"),
    markerCount: getInteger(row.diagnostics.markerCount, "country-map markerCount"),
    clusterCount: getInteger(row.diagnostics.clusterCount, "country-map clusterCount"),
    clusteredRegistrationCount: getInteger(
      row.diagnostics.clusteredRegistrationCount,
      "country-map clusteredRegistrationCount",
    ),
    truncated: getBoolean(row.diagnostics.truncated, "country-map truncated"),
  };
}

async function readAppV2CountryShelterMarkers(
  bounds?: AppV2CountryShelterMarkerBounds,
): Promise<{ markers: AppV2CountryShelterMarker[]; totalCount: number }> {
  const supabase = createAppV2PublicClient();
  const out: AppV2CountryShelterMarker[] = [];
  let from = 0;

  const countResult = bounds
    ? await supabase
        .from("country_marker_public_v2")
        .select("id", { count: "exact", head: true })
        .gte("latitude", bounds.south)
        .lte("latitude", bounds.north)
        .gte("longitude", bounds.west)
        .lte("longitude", bounds.east)
    : await supabase
        .from("country_marker_public_v2")
        .select("id", { count: "exact", head: true });

  if (countResult.error) {
    throw new Error(`Could not count app_v2 country shelter markers: ${countResult.error.message}`);
  }

  while (true) {
    const to = from + sitemapShelterPageSize - 1;
    const pageResult = bounds
      ? await supabase
          .from("country_marker_public_v2")
          .select(
            "id, slug, name, address_line1, postal_code, city, latitude, longitude, capacity, source_application_code",
          )
          .order("latitude", { ascending: true })
          .order("longitude", { ascending: true })
          .order("slug", { ascending: true })
          .gte("latitude", bounds.south)
          .lte("latitude", bounds.north)
          .gte("longitude", bounds.west)
          .lte("longitude", bounds.east)
          .range(from, to)
      : await supabase
          .from("country_marker_public_v2")
          .select(
            "id, slug, name, address_line1, postal_code, city, latitude, longitude, capacity, source_application_code",
          )
          .order("latitude", { ascending: true })
          .order("longitude", { ascending: true })
          .order("slug", { ascending: true })
          .range(from, to);

    const { data, error } = pageResult;

    if (error) {
      throw new Error(`Could not load app_v2 country shelter markers: ${error.message}`);
    }

    const rows = (data ?? []) as CountryShelterMarkerRow[];

    for (const row of rows) {
      const normalized = normalizeCountryShelterMarker(row);
      if (normalized) out.push(normalized);
    }

    if (rows.length < sitemapShelterPageSize) {
      break;
    }

    from += sitemapShelterPageSize;
  }

  return { markers: out, totalCount: countResult.count ?? out.length };
}

export async function getAppV2CountryShelterMarkers(): Promise<AppV2CountryShelterMarker[]> {
  return (await readAppV2CountryShelterMarkers()).markers;
}

/** Same as {@link getAppV2CountryShelterMarkers} (`country_marker_public`). */
export async function getAppV2PublicCountryShelterMarkers(): Promise<AppV2CountryShelterMarker[]> {
  return getAppV2CountryShelterMarkers();
}

export async function getAppV2PublicCountryShelterMarkersInBounds(
  bounds: AppV2CountryShelterMarkerBounds,
): Promise<{ markers: AppV2CountryShelterMarker[]; totalCount: number }> {
  return readAppV2CountryShelterMarkers(bounds);
}
