import { haversineMeters } from "./tiles";

const metersPerDegreeLatitude = 111_000;

/**
 * A box of ±`degrees` latitude around a point, as wide east and west as it is
 * north and south: a degree of longitude shrinks with cos(latitude), to about
 * 0.55 of a latitude degree in Denmark.
 */
export function boxAround(latitude: number, longitude: number, degrees: number) {
  const longitudeDegrees = degrees / Math.cos((latitude * Math.PI) / 180);
  return {
    south: latitude - degrees,
    north: latitude + degrees,
    west: longitude - longitudeDegrees,
    east: longitude + longitudeDegrees,
  };
}

type Positioned = { address_line1: string; latitude: number | null; longitude: number | null };

/**
 * Rows read in `boxAround(latitude, longitude, degrees)`, closest first.
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
  const radius = degrees * metersPerDegreeLatitude;
  const measured = rows
    .filter((row) => typeof row.latitude === "number" && typeof row.longitude === "number")
    .map((row) => ({ row, meters: haversineMeters(latitude, longitude, row.latitude!, row.longitude!) }))
    .sort((left, right) => left.meters - right.meters || left.row.address_line1.localeCompare(right.row.address_line1, "da-DK"));
  if (measured.filter(({ meters }) => meters <= radius).length < limit) return null;
  return measured.map(({ row }) => row);
}
