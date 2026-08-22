const stableShelterSlugPrefix = "registrering-";

export function getStableShelterSlug(shelterId: string) {
  const compactId = shelterId.trim().toLowerCase().replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/.test(compactId)) {
    throw new Error("A stable shelter slug requires a valid UUID.");
  }

  return `${stableShelterSlugPrefix}${compactId}`;
}

export function getShelterPublicPath(slug: string) {
  return `/beskyttelsesrum/${encodeURIComponent(slug)}`;
}
