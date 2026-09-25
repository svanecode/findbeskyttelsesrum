/**
 * Adressevælger is Klimadatastyrelsen's public address search and the official
 * successor to DAWA autocomplete (DAWA closes on 1 October 2026).
 * This module wraps it without React dependencies.
 *
 * Search results carry no coordinates. A selected entrance address (husnummer)
 * is resolved once, and its access point is converted from EPSG:25832
 * (ETRS89 / UTM zone 32N) to WGS84 latitude/longitude.
 */
import { isWithinDenmarkMapBounds } from "@/lib/maps/denmark-bounds";

export const adressevaelgerOrigin = "https://adressevaelger.dk";

// Klimadatastyrelsen asks every client to use this shared, public token until
// per-user tokens are introduced. It is not a secret.
const sharedPublicToken = "adressevaelger123";

const utmZone32Etrs89 = "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";

/**
 * A street suggestion is refined by replacing the input with `refineText` and
 * placing the caret at `caret`, so the visitor can type the house number
 * (e.g. "Nørrebrogade |, 2200 København N").
 */
export type AddressSuggestion =
  | { kind: "street"; label: string; refineText: string; caret: number }
  | { kind: "address"; id: string; label: string };

export type ResolvedAddress = {
  label: string;
  latitude: number;
  longitude: number;
};

function getToken() {
  return process.env.NEXT_PUBLIC_ADRESSEVAELGER_TOKEN?.trim() || sharedPublicToken;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readAdressevaelgerJson(response: Response, context: string) {
  if (!response.ok) {
    throw new Error(`Adressevælger ${context} failed with status ${response.status}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Adressevælger ${context} returned malformed JSON`);
  }

  // The API reports functional errors with HTTP 200 and status "fejl".
  if (!isRecord(json) || json.status !== "ok") {
    throw new Error(`Adressevælger ${context} returned an error response`);
  }

  return json;
}

export function parseAddressSuggestion(raw: unknown): AddressSuggestion | null {
  if (!isRecord(raw) || typeof raw.titel !== "string") return null;

  const label = raw.titel.trim();
  if (!label) return null;

  if (raw.type === "husnummer" && typeof raw.id === "string" && raw.id.trim()) {
    return { kind: "address", id: raw.id.trim(), label };
  }
  if (
    raw.type === "navngivenvejpostnummer"
    && typeof raw.vejnavn === "string"
    && typeof raw.postnr === "string"
    && typeof raw.postdistrikt === "string"
    && raw.vejnavn.trim()
  ) {
    const street = raw.vejnavn.trim();
    return {
      kind: "street",
      label,
      refineText: `${street} , ${raw.postnr.trim()} ${raw.postdistrikt.trim()}`,
      caret: street.length + 1,
    };
  }
  if (raw.type === "vejnavn" || raw.type === "navngivenvejpostnummer") {
    const refineText = `${label} `;
    return { kind: "street", label, refineText, caret: refineText.length };
  }

  return null;
}

export function dedupeAddressSuggestions(suggestions: AddressSuggestion[], limit: number) {
  const seen = new Set<string>();
  const result: AddressSuggestion[] = [];

  for (const suggestion of suggestions) {
    const key = suggestion.kind === "address"
      ? `address:${suggestion.id}`
      : `street:${suggestion.label.toLocaleLowerCase("da-DK")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(suggestion);
    if (result.length >= limit) break;
  }

  return result;
}

export async function searchAddresses(
  query: string,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<AddressSuggestion[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return [];

  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 5), 1), 20);
  const url = new URL("/husnumre/soeg", adressevaelgerOrigin);
  url.searchParams.set("tekst", trimmedQuery);
  url.searchParams.set("maksimum", String(Math.min(limit * 2, 20)));
  url.searchParams.set("token", getToken());

  const json = await readAdressevaelgerJson(await fetch(url, { signal: options.signal }), "search");
  if (!Array.isArray(json.fund)) {
    throw new Error("Adressevælger search returned an unexpected response");
  }

  const parsed = json.fund
    .map(parseAddressSuggestion)
    .filter((suggestion): suggestion is AddressSuggestion => suggestion !== null);

  return dedupeAddressSuggestions(parsed, limit);
}

export async function convertUtm32ToWgs84(easting: number, northing: number) {
  const { default: proj4 } = await import("proj4");
  const [longitude, latitude] = proj4(utmZone32Etrs89, "EPSG:4326", [easting, northing]);
  return { latitude, longitude };
}

export async function parseResolvedAddress(raw: unknown, fallbackLabel: string): Promise<ResolvedAddress> {
  const address = isRecord(raw) && isRecord(raw.husnummer) ? raw.husnummer : null;
  const accessPoint = address && isRecord(address.adgangspunkt) ? address.adgangspunkt : null;
  const coordinates = accessPoint && isRecord(accessPoint.koordinater) ? accessPoint.koordinater : null;
  const easting = coordinates?.x;
  const northing = coordinates?.y;

  if (
    typeof easting !== "number"
    || typeof northing !== "number"
    || !Number.isFinite(easting)
    || !Number.isFinite(northing)
  ) {
    throw new Error("Adressevælger address has no access point coordinates");
  }

  const { latitude, longitude } = await convertUtm32ToWgs84(easting, northing);
  if (!isWithinDenmarkMapBounds(latitude, longitude)) {
    throw new Error("Adressevælger address converted outside Denmark");
  }

  const label = typeof address?.adgangsadressebetegnelse === "string" && address.adgangsadressebetegnelse.trim()
    ? address.adgangsadressebetegnelse.trim()
    : fallbackLabel;

  return { label, latitude, longitude };
}

export async function resolveAddress(
  suggestion: Extract<AddressSuggestion, { kind: "address" }>,
  options: { signal?: AbortSignal } = {},
): Promise<ResolvedAddress> {
  const url = new URL(`/husnumre/${encodeURIComponent(suggestion.id)}`, adressevaelgerOrigin);
  url.searchParams.set("token", getToken());

  const json = await readAdressevaelgerJson(await fetch(url, { signal: options.signal }), "lookup");
  return parseResolvedAddress(json, suggestion.label);
}
