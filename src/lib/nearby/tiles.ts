/**
 * On-device nearby ranking from CDN-cached tiles (ARCH-01).
 *
 * The browser loads the 3x3 block of fixed grid tiles around the visitor and
 * ranks the rows locally, so a search costs the database nothing on a cache
 * hit and the exact position never leaves the device. The ranking mirrors
 * app_v2.get_nearby_shelters_public_v2 + groupNearbyRows in
 * src/lib/supabase/app-v2-queries.ts: Haversine distance, rows ordered by
 * distance then slug, grouped by normalized address, groups ordered by the
 * representative's distance then group key. Results are only returned when
 * they are guaranteed identical; otherwise the caller falls back to the
 * server search.
 */

export const nearbyTileContract = "nearby-tile-v1";
export const tileLatitudeStep = 0.25;
export const tileLongitudeStep = 0.4;

const earthRadiusMeters = 6_371_000;
const metersPerDegreeLatitude = (Math.PI / 180) * earthRadiusMeters;
// Rows at one address can sit a few metres apart; keep a margin so a group
// near the block edge cannot have members in an unloaded tile.
const groupCompletenessMarginMeters = 500;

// Tiles are only served for a generous box around Denmark, which bounds the
// set of cacheable URLs.
const tileLatitudeIndexRange = { min: Math.floor(53 / tileLatitudeStep), max: Math.floor(59 / tileLatitudeStep) };
const tileLongitudeIndexRange = { min: Math.floor(7 / tileLongitudeStep), max: Math.floor(16 / tileLongitudeStep) };

export type TileBounds = { south: number; north: number; west: number; east: number };

/** One registration in a tile: [slug, addressLine1, postalCode, city, latitude, longitude, capacity, applicationCode]. */
export type NearbyTileRow = [string, string, string, string, number, number, number, string | null];

export type NearbyTilePayload = {
  contract: typeof nearbyTileContract;
  tile: string;
  revision: string;
  labels: Record<string, string>;
  rows: NearbyTileRow[];
};

/** Same shape as one result of /api/app-v2/nearby/grouped, so the UI adapter is shared. */
export type RankedNearbyGroup = {
  groupKey: string;
  address: { line1: string; postalCode: string; city: string };
  coordinates: { latitude: number; longitude: number };
  distanceMeters: number;
  shelterCount: number;
  totalCapacity: number;
  applicationCodeLabel: string | null;
  applicationCodeLabels: string[];
  representativeShelter: { slug: string; name: string; capacity: number };
  shelters: Array<{ id: string; slug: string; name: string; capacity: number }>;
  shelterSlugs: string[];
};

function tileIndex(value: number, step: number) {
  return Math.floor(value / step);
}

export function tileKeyFor(latitude: number, longitude: number) {
  return `${tileIndex(latitude, tileLatitudeStep)}_${tileIndex(longitude, tileLongitudeStep)}`;
}

export function parseTileKey(key: string): { latitudeIndex: number; longitudeIndex: number; bounds: TileBounds } | null {
  const match = /^(-?\d{1,4})_(-?\d{1,4})$/.exec(key);
  if (!match) return null;

  const latitudeIndex = Number(match[1]);
  const longitudeIndex = Number(match[2]);
  if (
    latitudeIndex < tileLatitudeIndexRange.min
    || latitudeIndex > tileLatitudeIndexRange.max
    || longitudeIndex < tileLongitudeIndexRange.min
    || longitudeIndex > tileLongitudeIndexRange.max
  ) {
    return null;
  }

  return {
    latitudeIndex,
    longitudeIndex,
    bounds: {
      south: latitudeIndex * tileLatitudeStep,
      north: (latitudeIndex + 1) * tileLatitudeStep,
      west: longitudeIndex * tileLongitudeStep,
      east: (longitudeIndex + 1) * tileLongitudeStep,
    },
  };
}

/** The 3x3 block of tile keys centred on the tile containing the position. */
export function surroundingTileKeys(latitude: number, longitude: number) {
  const latitudeIndex = tileIndex(latitude, tileLatitudeStep);
  const longitudeIndex = tileIndex(longitude, tileLongitudeStep);
  const keys: string[] = [];
  for (let dLat = -1; dLat <= 1; dLat += 1) {
    for (let dLng = -1; dLng <= 1; dLng += 1) {
      keys.push(`${latitudeIndex + dLat}_${longitudeIndex + dLng}`);
    }
  }
  return keys;
}

/**
 * Distance in metres from the position to the nearest edge of its 3x3 tile
 * block: every registration outside the block is at least this far away.
 */
export function guaranteedCoverageMeters(latitude: number, longitude: number) {
  const south = (tileIndex(latitude, tileLatitudeStep) - 1) * tileLatitudeStep;
  const north = (tileIndex(latitude, tileLatitudeStep) + 2) * tileLatitudeStep;
  const west = (tileIndex(longitude, tileLongitudeStep) - 1) * tileLongitudeStep;
  const east = (tileIndex(longitude, tileLongitudeStep) + 2) * tileLongitudeStep;

  const latitudeMargin = Math.min(latitude - south, north - latitude) * metersPerDegreeLatitude;
  // A degree of longitude is shortest at the block's pole-ward edge.
  const narrowestLatitude = Math.max(Math.abs(south), Math.abs(north));
  const longitudeMargin = Math.min(longitude - west, east - longitude)
    * metersPerDegreeLatitude
    * Math.cos((narrowestLatitude * Math.PI) / 180);

  return Math.max(0, Math.min(latitudeMargin, longitudeMargin));
}

/** Haversine distance, the same formula as app_v2.get_nearby_shelters_public_v2. */
export function haversineMeters(latitude1: number, longitude1: number, latitude2: number, longitude2: number) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const a = Math.sin(toRadians(latitude2 - latitude1) / 2) ** 2
    + Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2))
    * Math.sin(toRadians(longitude2 - longitude1) / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function normalizeAddressPart(value: string) {
  return value.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
}

type RankableRow = {
  slug: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  latitude: number;
  longitude: number;
  capacity: number;
  applicationCode: string | null;
  distanceMeters: number;
};

/**
 * Ranks the rows of the loaded tiles. Returns null when the result cannot be
 * guaranteed identical to the server search, so the caller must fall back.
 */
export function rankNearbyGroupsFromTiles(
  tiles: NearbyTilePayload[],
  origin: { latitude: number; longitude: number },
  options: { limit: number; radiusMeters: number },
): RankedNearbyGroup[] | null {
  const labels = new Map<string, string>();
  const seen = new Set<string>();
  const rows: RankableRow[] = [];

  for (const tile of tiles) {
    for (const [code, label] of Object.entries(tile.labels)) labels.set(code, label);
    for (const [slug, addressLine1, postalCode, city, latitude, longitude, capacity, applicationCode] of tile.rows) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      const distanceMeters = haversineMeters(origin.latitude, origin.longitude, latitude, longitude);
      if (distanceMeters > options.radiusMeters) continue;
      rows.push({ slug, addressLine1, postalCode, city, latitude, longitude, capacity, applicationCode, distanceMeters });
    }
  }

  // Same tie-break as groupNearbyRows on the server.
  rows.sort((a, b) => a.distanceMeters - b.distanceMeters || a.slug.localeCompare(b.slug));

  const groups = new Map<string, RankableRow[]>();
  for (const row of rows) {
    const key = [row.addressLine1, row.postalCode, row.city].map(normalizeAddressPart).join(" ");
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const ranked = Array.from(groups.entries())
    .map(([groupKey, members]) => ({ groupKey, members, representative: members[0]! }))
    .sort((a, b) => a.representative.distanceMeters - b.representative.distanceMeters
      || a.groupKey.localeCompare(b.groupKey))
    .slice(0, options.limit);

  const coverage = guaranteedCoverageMeters(origin.latitude, origin.longitude);
  const searchIsWithinBlock = options.radiusMeters <= coverage - groupCompletenessMarginMeters;
  const lastGroup = ranked[ranked.length - 1];
  const limitReachedInsideBlock = ranked.length === options.limit
    && lastGroup !== undefined
    && lastGroup.representative.distanceMeters <= coverage - groupCompletenessMarginMeters;
  if (!searchIsWithinBlock && !limitReachedInsideBlock) return null;

  return ranked.map(({ groupKey, members, representative }) => {
    const applicationCodeLabels = Array.from(new Set(
      members
        .map((row) => (row.applicationCode ? labels.get(row.applicationCode) ?? null : null))
        .filter((label): label is string => Boolean(label)),
    )).sort((a, b) => a.localeCompare(b, "da-DK"));

    return {
      groupKey,
      address: { line1: representative.addressLine1, postalCode: representative.postalCode, city: representative.city },
      coordinates: { latitude: representative.latitude, longitude: representative.longitude },
      distanceMeters: representative.distanceMeters,
      shelterCount: members.length,
      totalCapacity: members.reduce((sum, row) => sum + row.capacity, 0),
      applicationCodeLabel: applicationCodeLabels.length > 1
        ? "Flere registrerede bygningsanvendelser"
        : (applicationCodeLabels[0] ?? null),
      applicationCodeLabels,
      representativeShelter: {
        slug: representative.slug,
        name: representative.addressLine1,
        capacity: representative.capacity,
      },
      shelters: members.map((row) => ({ id: row.slug, slug: row.slug, name: row.addressLine1, capacity: row.capacity })),
      shelterSlugs: members.map((row) => row.slug),
    };
  });
}

export function isNearbyTilePayload(value: unknown, tile: string): value is NearbyTilePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<NearbyTilePayload>;
  return payload.contract === nearbyTileContract
    && payload.tile === tile
    && typeof payload.revision === "string"
    && typeof payload.labels === "object" && payload.labels !== null
    && Array.isArray(payload.rows)
    && payload.rows.every((row) => Array.isArray(row)
      && row.length === 8
      && typeof row[0] === "string"
      && typeof row[4] === "number" && Number.isFinite(row[4])
      && typeof row[5] === "number" && Number.isFinite(row[5])
      && typeof row[6] === "number");
}
