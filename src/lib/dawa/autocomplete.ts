/**
 * DAWA is Denmark's official address API, exposed by Dataforsyningen.
 * This module wraps the public autocomplete endpoint without React dependencies.
 *
 * We use the combined autocomplete flow (no fixed `type=adresse`), so short queries
 * return vejnavn first; only full adresse/adgangsadresse items carry coordinates.
 */
export type DawaSuggestion = {
  tekst: string;
  forslagstekst?: string;
  caretpos?: number;
  dawaType?: string;
  data: {
    x?: number;
    y?: number;
    [key: string]: unknown;
  };
};

function parseDawaSuggestion(raw: unknown): DawaSuggestion | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const r = raw as Record<string, unknown>;
  if (typeof r.tekst !== "string" || !r.data || typeof r.data !== "object") {
    return null;
  }

  const data = r.data as Record<string, unknown>;

  return {
    tekst: r.tekst,
    forslagstekst: typeof r.forslagstekst === "string" ? r.forslagstekst : undefined,
    caretpos: typeof r.caretpos === "number" ? r.caretpos : undefined,
    dawaType: typeof r.type === "string" ? r.type : undefined,
    data: data as DawaSuggestion["data"],
  };
}

export function suggestionHasCoordinates(s: DawaSuggestion): boolean {
  return (
    typeof s.data.x === "number" &&
    Number.isFinite(s.data.x) &&
    typeof s.data.y === "number" &&
    Number.isFinite(s.data.y)
  );
}

export async function fetchAddressSuggestions(
  query: string,
  options: { signal?: AbortSignal; limit?: number; caretpos?: number } = {},
): Promise<DawaSuggestion[]> {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 2) {
    return [];
  }

  const limit = options.limit ?? 5;
  const caretpos = options.caretpos ?? trimmedQuery.length;
  const url = `https://api.dataforsyningen.dk/autocomplete?q=${encodeURIComponent(
    trimmedQuery,
  )}&caretpos=${encodeURIComponent(String(caretpos))}&per_side=${encodeURIComponent(String(limit))}`;

  const response = await fetch(url, { signal: options.signal });

  if (!response.ok) {
    throw new Error(`DAWA autocomplete request failed with status ${response.status}`);
  }

  let json: unknown;

  try {
    json = await response.json();
  } catch {
    throw new Error("DAWA autocomplete returned malformed JSON");
  }

  if (!Array.isArray(json)) {
    throw new Error("DAWA autocomplete returned an unexpected response");
  }

  const parsed: DawaSuggestion[] = [];

  for (const item of json) {
    const suggestion = parseDawaSuggestion(item);
    if (suggestion) {
      parsed.push(suggestion);
    }
    if (parsed.length >= limit) {
      break;
    }
  }

  return parsed;
}
