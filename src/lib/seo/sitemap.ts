import type { MetadataRoute } from "next";

type SitemapEntry = MetadataRoute.Sitemap[number];
type SitemapDate = Date | string | null | undefined;

export function parseSitemapDate(value: SitemapDate): Date | undefined {
  if (!value) return undefined;

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function mostRecentSitemapDate(...values: SitemapDate[]): Date | undefined {
  const dates = values
    .map(parseSitemapDate)
    .filter((date): date is Date => Boolean(date));

  if (dates.length === 0) return undefined;

  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function withLastModified(entry: SitemapEntry, lastModified: SitemapDate): SitemapEntry {
  const date = parseSitemapDate(lastModified);
  return date ? { ...entry, lastModified: date } : entry;
}

export function buildCoreSitemapRoutes(
  baseUrl: string,
  dates: {
    dataDrivenLastModified: SitemapDate;
    staticLastModified: SitemapDate;
  },
): MetadataRoute.Sitemap {
  return [
    withLastModified(
      {
        url: baseUrl,
        changeFrequency: "daily",
        priority: 1,
      },
      dates.dataDrivenLastModified,
    ),
    withLastModified(
      {
        url: `${baseUrl}/kort`,
        changeFrequency: "weekly",
        priority: 0.85,
      },
      dates.dataDrivenLastModified,
    ),
    withLastModified(
      {
        url: `${baseUrl}/om-data`,
        changeFrequency: "monthly",
        priority: 0.75,
      },
      dates.dataDrivenLastModified,
    ),
    withLastModified(
      {
        url: `${baseUrl}/privatliv`,
        changeFrequency: "monthly",
        priority: 0.5,
      },
      dates.staticLastModified,
    ),
    withLastModified(
      {
        url: `${baseUrl}/kommune`,
        changeFrequency: "weekly",
        priority: 0.82,
      },
      dates.dataDrivenLastModified,
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
