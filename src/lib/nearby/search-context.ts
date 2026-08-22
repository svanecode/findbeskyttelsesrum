export const nearbySearchStorageKey = "findbeskyttelsesrum.nearby-search.v1";

const nearbySearchMaxAgeMs = 60 * 60 * 1000;
let volatileNearbySearchContext: NearbySearchContext | null = null;

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

  // Keeps client-side navigation working when a strict browser blocks storage.
  // This value exists only in the current JavaScript runtime and is lost on reload.
  volatileNearbySearchContext = context;

  try {
    window.sessionStorage.setItem(nearbySearchStorageKey, JSON.stringify(context));
  } catch {
    // The volatile fallback above is enough for the immediate result navigation.
  }
  return true;
}

export function loadNearbySearchContext() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(nearbySearchStorageKey);
    if (!raw) return parseNearbySearchContext(volatileNearbySearchContext);

    const parsed = parseNearbySearchContext(JSON.parse(raw));
    if (!parsed) {
      window.sessionStorage.removeItem(nearbySearchStorageKey);
      return parseNearbySearchContext(volatileNearbySearchContext);
    }
    volatileNearbySearchContext = parsed;
    return parsed;
  } catch {
    return parseNearbySearchContext(volatileNearbySearchContext);
  }
}
