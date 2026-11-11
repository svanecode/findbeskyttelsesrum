import { guaranteedCoverageMeters, haversineMeters, parseTileKey, surroundingTileKeys } from "./tiles";

export type RelatedShelterRow = {
  id: string;
  slug: string;
  address_line1: string;
  postal_code: string;
  city: string;
  capacity: number;
};

function isRelatedShelterRow(value: unknown): value is RelatedShelterRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string"
    && typeof row.slug === "string"
    && typeof row.address_line1 === "string"
    && typeof row.postal_code === "string"
    && typeof row.city === "string"
    && typeof row.capacity === "number";
}

/**
 * The other registrations from get_nearby_shelters_public_v2's results,
 * which the database already sorts by distance. The registration itself is
 * left out, so the caller asks the database for one more than `limit`.
 */
export function pickRelatedFromNearby(results: unknown, shelterId: string, limit: number): RelatedShelterRow[] {
  if (!Array.isArray(results)) return [];
  return results
    .filter(isRelatedShelterRow)
    .filter((row) => row.id !== shelterId)
    .slice(0, limit);
}

/** A registration as the revision-cached nearby tiles carry it. */
export type RelatedTileMarker = {
  slug: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  capacity: number;
  latitude: number;
  longitude: number;
};

/** The tiles (key and bounds) that cover everything within reach of a position: its own tile and the eight around it. */
export function relatedTilesAround(latitude: number, longitude: number) {
  return surroundingTileKeys(latitude, longitude).flatMap((key) => {
    const parsed = parseTileKey(key);
    return parsed ? [{ key, bounds: parsed.bounds }] : [];
  });
}

/**
 * The registrations nearest to a position, closest first, ranked in memory from
 * the markers of the surrounding tiles instead of by the database. The tiles
 * hold the same public registrations (with coordinates) that
 * get_nearby_shelters_public_v2 searches, so the result is the same list.
 *
 * The registration itself is left out by slug (tiles carry no id), so the `id`
 * of a returned row is the registration's stable slug. A marker on a tile edge
 * is read from both tiles and counted once. The search stops at the smaller of
 * `radiusMeters` and the distance the 3x3 tile block is guaranteed to cover, so
 * a registration outside the loaded tiles can never be nearer than one returned.
 */
export function rankRelatedFromTileMarkers(
  markers: Iterable<RelatedTileMarker>,
  origin: { latitude: number; longitude: number },
  selfSlug: string,
  limit: number,
  radiusMeters: number,
): RelatedShelterRow[] {
  const reach = Math.min(radiusMeters, guaranteedCoverageMeters(origin.latitude, origin.longitude));
  const seen = new Set<string>([selfSlug]);
  const ranked: Array<{ row: RelatedShelterRow; distanceMeters: number }> = [];

  for (const marker of markers) {
    if (seen.has(marker.slug)) continue;
    seen.add(marker.slug);
    const distanceMeters = haversineMeters(origin.latitude, origin.longitude, marker.latitude, marker.longitude);
    if (distanceMeters > reach) continue;
    ranked.push({
      distanceMeters,
      row: {
        id: marker.slug,
        slug: marker.slug,
        address_line1: marker.addressLine1,
        postal_code: marker.postalCode,
        city: marker.city,
        capacity: marker.capacity,
      },
    });
  }

  ranked.sort((a, b) => a.distanceMeters - b.distanceMeters || a.row.slug.localeCompare(b.row.slug, "da-DK"));
  return ranked.slice(0, Math.max(0, limit)).map((entry) => entry.row);
}
