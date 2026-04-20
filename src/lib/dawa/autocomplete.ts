/**
 * DAWA is Denmark's official address API, exposed by Dataforsyningen.
 * This module wraps the public autocomplete endpoint without React dependencies.
 */
export type DawaSuggestion = {
  tekst: string;
  data: {
    x: number;
    y: number;
    [key: string]: unknown;
  };
};

function isDawaSuggestion(value: unknown): value is DawaSuggestion {
  if (!value || typeof value !== "object") {
    return false;
  }

  const suggestion = value as { tekst?: unknown; data?: { x?: unknown; y?: unknown } };

  return (
    typeof suggestion.tekst === "string" &&
    typeof suggestion.data?.x === "number" &&
    Number.isFinite(suggestion.data.x) &&
    typeof suggestion.data.y === "number" &&
    Number.isFinite(suggestion.data.y)
  );
}

export async function fetchAddressSuggestions(
  query: string,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<DawaSuggestion[]> {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 2) {
    return [];
  }

  const limit = options.limit ?? 5;
  const url = `https://api.dataforsyningen.dk/autocomplete?q=${encodeURIComponent(
    trimmedQuery,
  )}&type=adresse&per_side=${encodeURIComponent(String(limit))}`;
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

  return json.filter(isDawaSuggestion).slice(0, limit);
}
