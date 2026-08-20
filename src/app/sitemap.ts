import { MetadataRoute } from 'next'
import {
  getAppV2MunicipalitySlugs,
  getAppV2PublicDataStats,
  getAppV2PublicSitemapShelters,
} from '@/lib/supabase/app-v2-queries'
import {
  buildCoreSitemapRoutes,
  buildMunicipalitySitemapRoutes,
  mostRecentSitemapDate,
} from '@/lib/seo/sitemap'
import { siteUrl } from '@/lib/seo/site'

export const revalidate = 86400

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteUrl

  const [latestDataImportAt, municipalitySlugs, shelters] = await Promise.all([
    getLatestDataImportAt(),
    getMunicipalitySlugs(),
    getShelterRows(),
  ])
  const dataDrivenLastModified = mostRecentSitemapDate(
    process.env.SITE_BUILD_TIMESTAMP,
    latestDataImportAt,
  )

  return [
    ...buildCoreSitemapRoutes(baseUrl, {
      dataDrivenLastModified,
      staticLastModified: process.env.SITE_BUILD_TIMESTAMP,
    }),
    ...buildMunicipalitySitemapRoutes(baseUrl, municipalitySlugs, dataDrivenLastModified),
    ...shelters.map((row) => ({
      url: `${baseUrl}/beskyttelsesrum/${row.slug}`,
      ...(row.lastModified ? { lastModified: row.lastModified } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.72,
    })),
  ]
}

async function getLatestDataImportAt() {
  try {
    const stats = await getAppV2PublicDataStats()
    return stats.latestPublicImportAt
  } catch (error) {
    console.error('Error loading public data date for sitemap:', error)
    return null
  }
}

async function getMunicipalitySlugs() {
  try {
    return await getAppV2MunicipalitySlugs()
  } catch (error) {
    console.error('Error generating municipality routes:', error)
    return []
  }
}

async function getShelterRows() {
  try {
    return await getAppV2PublicSitemapShelters()
  } catch (error) {
    console.error('Error generating shelter routes:', error)
    return []
  }
}
