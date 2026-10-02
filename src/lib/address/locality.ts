/**
 * Town and postcode handling for the address search.
 *
 * Adressevælger matches the street and house number but ignores a town name in
 * the text ("Banegårdspladsen 1, Aarhus" returns Copenhagen first). It does
 * accept a `kommunekode` filter, so a town name is mapped to its municipality
 * codes here and sent as a filter. A bare postcode or town ("8000") has no
 * Adressevælger result at all, so it becomes an area suggestion.
 *
 * The table in postal-areas.json is derived from the published registrations
 * in app_v2 (postcode, name, municipality codes and the mean position of the
 * registrations), so it only covers postcodes that have registrations.
 */

export type PostalAreaRow = [postnr: string, name: string, municipalityCodes: string[], latitude: number, longitude: number];
export type MunicipalityRow = [code: string, name: string];

export type PostalAreaTable = {
  postnumre: PostalAreaRow[];
  kommuner: MunicipalityRow[];
};

export type PostalArea = {
  postnr: string;
  name: string;
  latitude: number;
  longitude: number;
};

export type ParsedLocality = {
  /** The street and house number part, or "" when the query is only a place. */
  street: string;
  /** Municipality codes the place name or postcode points at. */
  municipalityCodes: string[];
  /** Normalised place text, used to rank matching results first. */
  placeKey: string;
  /** Postcode areas that match when the query is only a place. */
  areas: PostalArea[];
};

/** Lower case, "aa" read as "å", punctuation and repeated spaces removed. */
export function normalizePlaceText(value: string) {
  return value
    .toLocaleLowerCase("da-DK")
    .normalize("NFC")
    .replace(/aa/g, "å")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Swaps "aa" and "å" so both spellings can be searched. Returns null when there is nothing to swap. */
export function alternateAaSpelling(value: string) {
  if (/aa/i.test(value)) {
    return value.replace(/aa/g, "å").replace(/Aa/g, "Å").replace(/AA/g, "Å");
  }
  if (/å/i.test(value)) {
    return value.replace(/å/g, "aa").replace(/Å/g, "Aa");
  }
  return null;
}

type PlaceMatch = { codes: string[]; areas: PostalArea[] };

function toArea(row: PostalAreaRow): PostalArea {
  return { postnr: row[0], name: row[1], latitude: row[3], longitude: row[4] };
}

/**
 * Codes and areas for a place text: a four digit postcode, a postcode name
 * ("Aarhus C"), the start of postcode names ("Aarhus" covers Aarhus C, N and
 * V) or a municipality name.
 */
export function matchPlace(text: string, table: PostalAreaTable): PlaceMatch | null {
  const key = normalizePlaceText(text);
  if (!key) return null;

  const postcode = /^(\d{4})(?: (.+))?$/.exec(key);
  if (postcode) {
    const rows = table.postnumre.filter((row) => row[0] === postcode[1]);
    if (rows.length === 0) return { codes: [], areas: [] };
    return { codes: Array.from(new Set(rows.flatMap((row) => row[2]))), areas: rows.map(toArea) };
  }
  if (/\d/.test(key)) return null;

  const exact = table.postnumre.filter((row) => normalizePlaceText(row[1]) === key);
  const prefixed = exact.length > 0
    ? exact
    : table.postnumre.filter((row) => normalizePlaceText(row[1]).startsWith(`${key} `));
  const municipalities = table.kommuner.filter((row) => normalizePlaceText(row[1]) === key);

  if (prefixed.length === 0 && municipalities.length === 0) return null;

  const codes = new Set<string>([
    ...prefixed.flatMap((row) => row[2]),
    ...municipalities.map((row) => row[0]),
  ]);
  // One area per distinct postcode name: "København V" covers many postcodes.
  const areasByName = new Map<string, PostalArea>();
  for (const row of prefixed) {
    if (!areasByName.has(row[1])) areasByName.set(row[1], toArea(row));
  }
  return { codes: Array.from(codes).sort(), areas: Array.from(areasByName.values()) };
}

/**
 * Splits "Banegårdspladsen 1, Aarhus" or "Banegaardspladsen 1 Aarhus" into the
 * street part and the place. Text after the last comma is the place; without a
 * comma the last one to three words are tried. A trailing postcode is left to
 * Adressevælger, which already matches it.
 */
export function parseLocality(query: string, table: PostalAreaTable): ParsedLocality | null {
  const trimmed = query.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  const whole = matchPlace(trimmed, table);
  if (whole) {
    return { street: "", municipalityCodes: whole.codes, placeKey: normalizePlaceText(trimmed), areas: whole.areas };
  }

  const comma = trimmed.lastIndexOf(",");
  if (comma > 0) {
    const street = trimmed.slice(0, comma).trim();
    const place = trimmed.slice(comma + 1).trim();
    if (!street || !place || /^\d{4}\b/.test(place)) return null;
    const match = matchPlace(place, table);
    if (!match || match.codes.length === 0) return null;
    return { street, municipalityCodes: match.codes, placeKey: normalizePlaceText(place), areas: [] };
  }

  const words = trimmed.split(" ");
  for (let count = Math.min(3, words.length - 1); count >= 1; count -= 1) {
    const place = words.slice(-count).join(" ");
    const street = words.slice(0, -count).join(" ");
    if (/^\d/.test(place) || !/\p{L}/u.test(street)) continue;
    const match = matchPlace(place, table);
    if (match && match.codes.length > 0) {
      return { street, municipalityCodes: match.codes, placeKey: normalizePlaceText(place), areas: [] };
    }
  }
  return null;
}

let tablePromise: Promise<PostalAreaTable> | null = null;

/** Loads the table on first use, so it stays out of the first page load. */
export function loadPostalAreaTable(): Promise<PostalAreaTable> {
  tablePromise ??= import("./postal-areas.json").then((module) => {
    const data = ((module as unknown as { default?: PostalAreaTable }).default ?? module) as unknown as PostalAreaTable;
    return { postnumre: data.postnumre, kommuner: data.kommuner };
  }).catch((error) => {
    tablePromise = null;
    throw error;
  });
  return tablePromise;
}
