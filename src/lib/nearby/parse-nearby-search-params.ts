export type NearbyCoordsParseResult =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "ok"; lat: string; lng: string };

/**
 * Single server-side parse for /shelters/nearby query params (lat/lng).
 */
export function parseNearbySearchParams(sp: {
  lat?: string | string[];
  lng?: string | string[];
}): NearbyCoordsParseResult {
  const latRaw = typeof sp.lat === "string" ? sp.lat : Array.isArray(sp.lat) ? sp.lat[0] : "";
  const lngRaw = typeof sp.lng === "string" ? sp.lng : Array.isArray(sp.lng) ? sp.lng[0] : "";

  const lat = latRaw.trim();
  const lng = lngRaw.trim();

  if (!lat || !lng) {
    return { kind: "missing" };
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (
    !Number.isFinite(latNum) ||
    !Number.isFinite(lngNum) ||
    latNum < -90 ||
    latNum > 90 ||
    lngNum < -180 ||
    lngNum > 180
  ) {
    return { kind: "invalid" };
  }

  return { kind: "ok", lat, lng };
}
