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
