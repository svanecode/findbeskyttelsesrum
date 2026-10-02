/**
 * Server-side search across all of a municipality's addresses. The visible
 * URL is /kommune/<slug>?q=<text>&side=<n>; src/proxy.ts rewrites it to the
 * dynamic /kommune/<slug>/soeg route so the plain municipality pages stay
 * static.
 */

export const municipalitySearchMaxLength = 80;

/** Lower case, "aa" read as "å", punctuation removed, single spaces. */
export function normalizeMunicipalitySearchText(value: string) {
  return value
    .toLocaleLowerCase("da-DK")
    .normalize("NFC")
    .replace(/aa/g, "å")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function parseMunicipalitySearchQuery(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, municipalitySearchMaxLength);
}

type SearchableGroup = {
  addressLine1: string;
  postalCode: string;
  city: string;
  applicationCodeLabels: string[];
};

/** Every word of the query must appear in the address, postcode, town or building use. */
export function filterMunicipalityGroups<T extends SearchableGroup>(groups: T[], query: string): T[] {
  const words = normalizeMunicipalitySearchText(query).split(" ").filter(Boolean);
  if (words.length === 0) return groups;
  return groups.filter((group) => {
    const haystack = normalizeMunicipalitySearchText(
      [group.addressLine1, group.postalCode, group.city, ...group.applicationCodeLabels].join(" "),
    );
    return words.every((word) => haystack.includes(word));
  });
}

/** The address of a municipality page, with the search and page in the query when searching. */
export function getMunicipalitySearchPath(slug: string, query: string, page = 1) {
  const params = new URLSearchParams({ q: query });
  if (page > 1) params.set("side", String(page));
  return `/kommune/${encodeURIComponent(slug)}?${params.toString()}`;
}
