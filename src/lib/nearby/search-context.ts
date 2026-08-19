export const nearbySearchStorageKey = "findbeskyttelsesrum.nearby-search.v1";

const nearbySearchMaxAgeMs = 12 * 60 * 60 * 1000;

export type NearbySearchContext = {
  version: 1;
  latitude: number;
  longitude: number;
  label?: string;
  createdAt: number;
};

export type NearbySearchInput = {
  latitude: number;
  longitude: number;
  label?: string;
};

function isValidLatitude(value: number) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function createNearbySearchContext(
  input: NearbySearchInput,
  createdAt = Date.now(),
): NearbySearchContext | null {
  if (!isValidLatitude(input.latitude) || !isValidLongitude(input.longitude)) {
    return null;
  }

  const label = input.label?.trim().slice(0, 120);

  return {
    version: 1,
    latitude: input.latitude,
    longitude: input.longitude,
    ...(label ? { label } : {}),
    createdAt,
  };
}

export function parseNearbySearchContext(
  value: unknown,
  now = Date.now(),
): NearbySearchContext | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<NearbySearchContext>;
  if (
    candidate.version !== 1 ||
    typeof candidate.latitude !== "number" ||
    typeof candidate.longitude !== "number" ||
    typeof candidate.createdAt !== "number" ||
    !isValidLatitude(candidate.latitude) ||
    !isValidLongitude(candidate.longitude) ||
    !Number.isFinite(candidate.createdAt) ||
    candidate.createdAt > now + 60_000 ||
    now - candidate.createdAt > nearbySearchMaxAgeMs ||
    (candidate.label !== undefined && typeof candidate.label !== "string")
  ) {
    return null;
  }

  return createNearbySearchContext(
    {
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      label: candidate.label,
    },
    candidate.createdAt,
  );
}

export function saveNearbySearchContext(input: NearbySearchInput) {
  if (typeof window === "undefined") return false;

  const context = createNearbySearchContext(input);
  if (!context) return false;

  try {
    window.sessionStorage.setItem(nearbySearchStorageKey, JSON.stringify(context));
    return true;
  } catch {
    return false;
  }
}

export function loadNearbySearchContext() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(nearbySearchStorageKey);
    if (!raw) return null;

    const parsed = parseNearbySearchContext(JSON.parse(raw));
    if (!parsed) {
      window.sessionStorage.removeItem(nearbySearchStorageKey);
    }
    return parsed;
  } catch {
    return null;
  }
}
