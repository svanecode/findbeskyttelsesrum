export const municipalityAddressPageSize = 30;

export function parseMunicipalityPage(value: string | string[] | undefined): number | null {
  if (value === undefined) return 1;
  if (Array.isArray(value) || !/^[1-9]\d*$/.test(value)) return null;

  const page = Number(value);
  return Number.isSafeInteger(page) ? page : null;
}

export function getMunicipalityPagePath(slug: string, page: number) {
  const basePath = `/kommune/${encodeURIComponent(slug)}`;
  return page <= 1 ? basePath : `${basePath}/side/${page}`;
}

export function paginateMunicipalityGroups<T>(items: T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / municipalityAddressPageSize));
  if (page < 1 || page > totalPages) return null;

  const startIndex = (page - 1) * municipalityAddressPageSize;
  const pageItems = items.slice(startIndex, startIndex + municipalityAddressPageSize);

  return {
    items: pageItems,
    currentPage: page,
    totalPages,
    totalItems: items.length,
    firstItemNumber: pageItems.length > 0 ? startIndex + 1 : 0,
    lastItemNumber: startIndex + pageItems.length,
  };
}

/**
 * Page links to show: the first and last page and two on each side of the
 * current one, with "gap" where pages are left out. Previous/next links still
 * reach every page.
 */
export function municipalityPageLinks(currentPage: number, totalPages: number): Array<number | "gap"> {
  const pages = new Set([1, totalPages]);
  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page >= 1 && page <= totalPages) pages.add(page);
  }
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const links: Array<number | "gap"> = [];
  for (const page of sorted) {
    const previous = links[links.length - 1];
    if (typeof previous === "number" && page - previous === 2) links.push(previous + 1);
    else if (typeof previous === "number" && page - previous > 2) links.push("gap");
    links.push(page);
  }
  return links;
}
