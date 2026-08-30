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
