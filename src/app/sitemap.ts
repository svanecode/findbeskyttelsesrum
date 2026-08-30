import { MetadataRoute } from 'next'
import {
  getAppV2MunicipalitySlugs,
  getAppV2PublicDataStats,
  getAppV2PublicSitemapShelters,
} from '@/lib/supabase/app-v2-queries'
import {
  buildCoreSitemapRoutes,
  buildMunicipalitySitemapRoutes,
} from '@/lib/seo/sitemap'
import { siteUrl } from '@/lib/seo/site'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteUrl

  const [stats, municipalitySlugs, shelters] = await Promise.all([
    getAppV2PublicDataStats(),
    getAppV2MunicipalitySlugs(),
    getAppV2PublicSitemapShelters(),
  ])
  const dataDrivenLastModified = stats.latestPublicImportAt

  return [
    ...buildCoreSitemapRoutes(baseUrl, dataDrivenLastModified),
    ...buildMunicipalitySitemapRoutes(baseUrl, municipalitySlugs, dataDrivenLastModified),
    ...shelters.map((row) => ({
      url: `${baseUrl}/beskyttelsesrum/${row.slug}`,
      ...(row.lastModified ? { lastModified: row.lastModified } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.72,
    })),
  ]
}
