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

import {
  alternateAaSpelling,
  loadPostalAreaTable,
  matchPlace,
  normalizePlaceText,
  parseLocality,
  type ParsedLocality,
  type PostalAreaTable,
} from "./locality";

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
  | { kind: "address"; id: string; label: string }
  // A postcode as a whole, searched from the middle of its registrations.
  | { kind: "area"; id: string; label: string; latitude: number; longitude: number };

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

/** How long one Adressevælger request may take before the visitor is told it failed. */
export const adressevaelgerTimeoutMs = 10_000;

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

/**
 * One request with a time limit that covers both headers and body. On a
 * congested network a request can hang for minutes; after the limit it fails
 * with an ordinary Error (not an AbortError), so the search shows "Prøv igen"
 * instead of a spinner. The caller's own signal still aborts it as before.
 */
async function requestAdressevaelgerJson(url: URL, context: string, signal?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, adressevaelgerTimeoutMs);
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    return await readAdressevaelgerJson(await fetch(url, { signal: controller.signal }), context);
  } catch (error) {
    if (timedOut) throw new Error(`Adressevælger did not answer within ${adressevaelgerTimeoutMs} ms`);
    // A cancelled search stays an AbortError, also when the body was cut off.
    if (signal?.aborted) throw signal.reason ?? error;
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
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
    const key = suggestion.kind === "street"
      ? `street:${suggestion.label.toLocaleLowerCase("da-DK")}`
      : `${suggestion.kind}:${suggestion.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(suggestion);
    if (result.length >= limit) break;
  }

  return result;
}

async function fetchSuggestions(
  text: string,
  maximum: number,
  options: { signal?: AbortSignal; municipalityCodes?: string[] },
): Promise<AddressSuggestion[]> {
  const url = new URL("/husnumre/soeg", adressevaelgerOrigin);
  url.searchParams.set("tekst", text);
  url.searchParams.set("maksimum", String(maximum));
  if (options.municipalityCodes?.length) {
    url.searchParams.set("kommunekode", options.municipalityCodes.join(","));
  }
  url.searchParams.set("token", getToken());

  const json = await requestAdressevaelgerJson(url, "search", options.signal);
  if (!Array.isArray(json.fund)) {
    throw new Error("Adressevælger search returned an unexpected response");
  }

  return json.fund
    .map(parseAddressSuggestion)
    .filter((suggestion): suggestion is AddressSuggestion => suggestion !== null);
}

/** Results whose label names the typed place ("Aarhus" in "8000 Aarhus C") come first. */
function rankByPlace(suggestions: AddressSuggestion[], placeKey: string) {
  if (!placeKey) return suggestions;
  const matches = (suggestion: AddressSuggestion) => normalizePlaceText(suggestion.label).includes(placeKey);
  return [...suggestions.filter(matches), ...suggestions.filter((suggestion) => !matches(suggestion))];
}

async function readLocality(query: string): Promise<ParsedLocality | null> {
  try {
    return parseLocality(query, await loadPostalAreaTable());
  } catch {
    // Without the table the search still works, just without town ranking.
    return null;
  }
}

export async function searchAddresses(
  query: string,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<AddressSuggestion[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return [];

  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 5), 1), 20);
  const maximum = Math.min(limit * 2, 20);
  const locality = await readLocality(trimmedQuery);

  // Only a postcode or town: offer the area itself, then any streets with that name.
  if (locality && !locality.street) {
    const areas: AddressSuggestion[] = locality.areas.map((area) => ({
      kind: "area",
      id: area.postnr,
      label: `${area.postnr} ${area.name}`,
      latitude: area.latitude,
      longitude: area.longitude,
    }));
    const streets = /^\d/.test(trimmedQuery)
      ? []
      : await fetchSuggestions(trimmedQuery, maximum, options).catch((error) => {
        if (areas.length === 0 || options.signal?.aborted) throw error;
        return [];
      });
    return dedupeAddressSuggestions([...areas, ...streets], limit);
  }

  const requests: Array<Promise<AddressSuggestion[]>> = [];
  if (locality) {
    // The municipality filter also makes Adressevælger match "aa" against "å".
    requests.push(fetchSuggestions(locality.street, maximum, { ...options, municipalityCodes: locality.municipalityCodes }));
  }
  requests.push(fetchSuggestions(trimmedQuery, maximum, options));
  const alternate = locality ? null : alternateAaSpelling(trimmedQuery);
  if (alternate) requests.push(fetchSuggestions(alternate, maximum, options));

  // One failed extra lookup must not cost the visitor the others.
  const settled = await Promise.allSettled(requests);
  const fulfilled = settled.filter((result) => result.status === "fulfilled");
  if (fulfilled.length === 0) throw (settled[0] as PromiseRejectedResult).reason;
  // The town was understood and its municipality has no such address: say so
  // instead of offering the same street in other towns ("Vestergade 1, Læsø").
  const filtered = settled[0];
  if (locality && filtered?.status === "fulfilled" && filtered.value.length === 0) return [];
  const [first, ...rest] = settled.map((result) => result.status === "fulfilled" ? result.value : []);
  const merged = locality
    ? [...rankByPlace(first ?? [], locality.placeKey), ...rest.flat()]
    : interleave(first ?? [], rest[0] ?? []);

  return dedupeAddressSuggestions(merged, limit);
}

/** Alternates two result lists so both spellings of "aa"/"å" are represented near the top. */
function interleave(primary: AddressSuggestion[], secondary: AddressSuggestion[]) {
  if (secondary.length === 0) return primary;
  const result: AddressSuggestion[] = [];
  const length = Math.max(primary.length, secondary.length);
  for (let index = 0; index < length; index += 1) {
    if (primary[index]) result.push(primary[index]!);
    if (secondary[index]) result.push(secondary[index]!);
  }
  return result;
}

/**
 * The suggestion a free-text search can take without asking: the only result,
 * or the one whose label is exactly what was typed (case, "aa"/"å", commas
 * and spacing ignored). Streets are never taken, because they still need a
 * house number.
 */
export function pickUnambiguousSuggestion(query: string, suggestions: AddressSuggestion[]) {
  const choosable = suggestions.filter(
    (suggestion): suggestion is Exclude<AddressSuggestion, { kind: "street" }> => suggestion.kind !== "street",
  );
  const typed = normalizePlaceText(query);
  const exact = choosable.filter((suggestion) => normalizePlaceText(suggestion.label) === typed);
  if (exact.length === 1) return exact[0]!;
  if (suggestions.length === 1 && choosable.length === 1) return choosable[0]!;
  return null;
}

const houseNumberAtEnd = /\d+ ?\p{L}?$/u;
const addressLabelParts = /^(.+), (\d{4}) (.+)$/;

/** Splits typed text into the street with house number and the place after it. */
function splitTypedAddress(query: string): { street: string; place: string } | null {
  const trimmed = query.trim().replace(/\s+/g, " ");
  const comma = trimmed.lastIndexOf(",");
  if (comma > 0) return { street: trimmed.slice(0, comma).trim(), place: trimmed.slice(comma + 1).trim() };
  const postcode = /^(.*?\d+ ?\p{L}?) (\d{4}(?: .+)?)$/u.exec(trimmed);
  if (postcode) return { street: postcode[1]!, place: postcode[2]! };
  const words = trimmed.split(" ");
  for (let count = Math.min(3, words.length - 1); count >= 1; count -= 1) {
    const street = words.slice(0, -count).join(" ");
    if (houseNumberAtEnd.test(street)) return { street, place: words.slice(-count).join(" ") };
  }
  return null;
}

/**
 * The one address that matches typed street, house number and place exactly
 * (C2.3): "Banegårdspladsen 1, Aarhus" takes "Banegårdspladsen 1, 8000 Aarhus C"
 * but not 1A, and only when no other address in the list also matches. The
 * place may be a postcode, a postcode name, the start of one ("Aarhus") or a
 * municipality name. Without a house number nothing is taken.
 */
export function pickExactAddressMatch(query: string, suggestions: AddressSuggestion[], table: PostalAreaTable | null) {
  if (!table) return null;
  const typed = splitTypedAddress(query);
  if (!typed || !typed.place || !houseNumberAtEnd.test(typed.street)) return null;
  const typedStreet = normalizePlaceText(typed.street);
  const place = matchPlace(typed.place, table);
  if (!place) return null;
  const placePostcodes = new Set(place.areas.map((area) => area.postnr));
  const placeCodes = new Set(place.codes);
  const typedPostcode = /^(\d{4})\b/.exec(typed.place)?.[1] ?? null;

  const matches = suggestions.filter((suggestion): suggestion is Extract<AddressSuggestion, { kind: "address" }> => {
    if (suggestion.kind !== "address") return false;
    const parts = addressLabelParts.exec(suggestion.label);
    if (!parts || normalizePlaceText(parts[1]!) !== typedStreet) return false;
    const postnr = parts[2]!;
    if (typedPostcode) return postnr === typedPostcode;
    if (placePostcodes.has(postnr)) return true;
    const district = normalizePlaceText(parts[3]!);
    const key = normalizePlaceText(typed.place);
    if (district === key || district.startsWith(`${key} `)) return true;
    return table.postnumre.some((row) => row[0] === postnr && row[2].some((code) => placeCodes.has(code)));
  });
  return matches.length === 1 ? matches[0]! : null;
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

  const json = await requestAdressevaelgerJson(url, "lookup", options.signal);
  return parseResolvedAddress(json, suggestion.label);
}
