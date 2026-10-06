/**
 * Town and postcode handling for the address search.
 *
 * Adressevælger matches the street and house number but ignores a town name in
 * the text ("Banegårdspladsen 1, Aarhus" returns Copenhagen first). It does
 * accept a `kommunekode` filter, so a town name is mapped to its municipality
 * codes here and sent as a filter. A bare postcode or town ("8000") has no
 * Adressevælger result at all, so it becomes an area suggestion.
 *
 * The live table comes from app_v2.postal_areas: every DAR postcode, refreshed
 * by each import, positioned by its registrations or, without any, by one DAR
 * address. postal-areas.json is a bundled fallback with all 1,089 postcodes
 * and 98 municipalities as of 5 October 2026.
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
  /** True when the place is a municipality's name, so its codes are complete. */
  isMunicipalityName: boolean;
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

type PlaceMatch = { codes: string[]; areas: PostalArea[]; isMunicipalityName: boolean };

function toArea(row: PostalAreaRow): PostalArea {
  return { postnr: row[0], name: row[1], latitude: row[3], longitude: row[4] };
}

/**
 * Codes and areas for a place text: a four digit postcode, a postcode name
 * ("Aarhus C"), the start of postcode names ("Aarhus" covers Aarhus C, N and
 * V, "Aalborg" covers 9000 and Aalborg SV, SØ and Øst) or a municipality name.
 */
export function matchPlace(text: string, table: PostalAreaTable): PlaceMatch | null {
  const key = normalizePlaceText(text);
  if (!key) return null;

  const postcode = /^(\d{4})(?: (.+))?$/.exec(key);
  if (postcode) {
    const rows = table.postnumre.filter((row) => row[0] === postcode[1]);
    if (rows.length === 0) return { codes: [], areas: [], isMunicipalityName: false };
    return { codes: Array.from(new Set(rows.flatMap((row) => row[2]))), areas: rows.map(toArea), isMunicipalityName: false };
  }
  if (/\d/.test(key)) return null;

  // "Aalborg" is both a postcode name (9000) and the start of others (9200
  // Aalborg SV, 9210 Aalborg SØ, 9220 Aalborg Øst), so both kinds count.
  const prefixed = table.postnumre.filter((row) => {
    const name = normalizePlaceText(row[1]);
    return name === key || name.startsWith(`${key} `);
  });
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
  return { codes: Array.from(codes).sort(), areas: Array.from(areasByName.values()), isMunicipalityName: municipalities.length > 0 };
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
    return { street: "", municipalityCodes: whole.codes, placeKey: normalizePlaceText(trimmed), areas: whole.areas, isMunicipalityName: whole.isMunicipalityName };
  }

  const comma = trimmed.lastIndexOf(",");
  if (comma > 0) {
    const street = trimmed.slice(0, comma).trim();
    const place = trimmed.slice(comma + 1).trim();
    if (!street || !place || /^\d{4}\b/.test(place)) return null;
    const match = matchPlace(place, table);
    if (!match || match.codes.length === 0) return null;
    return { street, municipalityCodes: match.codes, placeKey: normalizePlaceText(place), areas: [], isMunicipalityName: match.isMunicipalityName };
  }

  const words = trimmed.split(" ");
  for (let count = Math.min(3, words.length - 1); count >= 1; count -= 1) {
    const place = words.slice(-count).join(" ");
    const street = words.slice(0, -count).join(" ");
    if (/^\d/.test(place) || !/\p{L}/u.test(street)) continue;
    const match = matchPlace(place, table);
    if (match && match.codes.length > 0) {
      return { street, municipalityCodes: match.codes, placeKey: normalizePlaceText(place), areas: [], isMunicipalityName: match.isMunicipalityName };
    }
  }
  return null;
}

export function isPostalAreaTable(value: unknown): value is PostalAreaTable {
  if (!value || typeof value !== "object") return false;
  const table = value as Partial<PostalAreaTable>;
  return Array.isArray(table.postnumre) && Array.isArray(table.kommuner)
    && table.postnumre.every((row) => Array.isArray(row) && row.length === 5
      && typeof row[0] === "string" && typeof row[1] === "string" && Array.isArray(row[2])
      && typeof row[3] === "number" && typeof row[4] === "number");
}

async function loadBundledTable(): Promise<PostalAreaTable> {
  const imported = await import("./postal-areas.json");
  const data = ((imported as unknown as { default?: PostalAreaTable }).default ?? imported) as unknown as PostalAreaTable;
  return { postnumre: data.postnumre, kommuner: data.kommuner };
}

let tablePromise: Promise<PostalAreaTable> | null = null;

/**
 * Loads the postcode table on first use, so it stays out of the first page
 * load. The live table (/api/app-v2/postal-areas) has every Danish postcode
 * and is refreshed by each import; the bundled copy is the fallback when it
 * cannot be reached.
 */
export function loadPostalAreaTable(): Promise<PostalAreaTable> {
  tablePromise ??= (async () => {
    if (typeof window !== "undefined") {
      try {
        const response = await fetch("/api/app-v2/postal-areas", { signal: AbortSignal.timeout(4000) });
        if (response.ok) {
          const table: unknown = await response.json();
          if (isPostalAreaTable(table)) return table;
        }
      } catch {
        // Fall back to the bundled table below.
      }
    }
    return loadBundledTable();
  })().catch((error) => {
    tablePromise = null;
    throw error;
  });
  return tablePromise;
}
