export const denmarkGeographicBounds = {
  north: 58,
  south: 54,
  east: 15.3,
  west: 8,
} as const;

export const denmarkMaxBounds: [[number, number], [number, number]] = [
  [denmarkGeographicBounds.south, denmarkGeographicBounds.west],
  [denmarkGeographicBounds.north, denmarkGeographicBounds.east],
];

export function isWithinDenmarkMapBounds(latitude: number, longitude: number) {
  return latitude >= denmarkGeographicBounds.south
    && latitude <= denmarkGeographicBounds.north
    && longitude >= denmarkGeographicBounds.west
    && longitude <= denmarkGeographicBounds.east;
}
