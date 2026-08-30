import type { MetadataRoute } from "next";

type SitemapEntry = MetadataRoute.Sitemap[number];
type SitemapDate = Date | string | null | undefined;

export function parseSitemapDate(value: SitemapDate): Date | undefined {
  if (!value) return undefined;

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function withLastModified(entry: SitemapEntry, lastModified: SitemapDate): SitemapEntry {
  const date = parseSitemapDate(lastModified);
  return date ? { ...entry, lastModified: date } : entry;
}

export function buildCoreSitemapRoutes(
  baseUrl: string,
  dataDrivenLastModified: SitemapDate,
): MetadataRoute.Sitemap {
  return [
    withLastModified(
      {
        url: baseUrl,
        changeFrequency: "daily",
        priority: 1,
      },
      dataDrivenLastModified,
    ),
    withLastModified(
      {
        url: `${baseUrl}/kort`,
        changeFrequency: "weekly",
        priority: 0.85,
      },
      dataDrivenLastModified,
    ),
    withLastModified(
      {
        url: `${baseUrl}/om-data`,
        changeFrequency: "monthly",
        priority: 0.75,
      },
      dataDrivenLastModified,
    ),
    {
      url: `${baseUrl}/privatliv`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/kontakt`,
      changeFrequency: "monthly",
      priority: 0.55,
    },
    withLastModified(
      {
        url: `${baseUrl}/kommune`,
        changeFrequency: "weekly",
        priority: 0.82,
      },
      dataDrivenLastModified,
    ),
  ];
}

export function buildMunicipalitySitemapRoutes(
  baseUrl: string,
  municipalitySlugs: string[],
  lastModified: SitemapDate,
): MetadataRoute.Sitemap {
  return municipalitySlugs.map((slug) =>
    withLastModified(
      {
        url: `${baseUrl}/kommune/${slug}`,
        changeFrequency: "weekly",
        priority: 0.8,
      },
      lastModified,
    ),
  );
}
