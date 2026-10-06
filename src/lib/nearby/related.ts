import { haversineMeters } from "./tiles";

type Positioned = { address_line1: string; latitude: number | null; longitude: number | null };

/**
 * Rows read in a box of ±`degrees` latitude around a point, closest first.
 * Null when fewer than `limit` rows lie
 * within the circle that fits inside the box: a row outside that circle but
 * outside the box too could be closer, so a wider box is needed.
 */
export function closestInBox<T extends Positioned>(
  rows: T[],
  latitude: number,
  longitude: number,
  degrees: number,
  limit: number,
): T[] | null {
  const radius = degrees * 111_000;
  const measured = rows
    .filter((row) => typeof row.latitude === "number" && typeof row.longitude === "number")
    .map((row) => ({ row, meters: haversineMeters(latitude, longitude, row.latitude!, row.longitude!) }))
    .sort((left, right) => left.meters - right.meters || left.row.address_line1.localeCompare(right.row.address_line1, "da-DK"));
  if (measured.filter(({ meters }) => meters <= radius).length < limit) return null;
  return measured.map(({ row }) => row);
}
