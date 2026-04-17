import { MetadataRoute } from 'next'
import { getAppV2MunicipalitySlugs } from '@/lib/supabase/app-v2-queries'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://findbeskyttelsesrum.dk'
  
  const routes = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },

    {
      url: `${baseUrl}/shelters/nearby`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/tell-me-more`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/om-data`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/kommune`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    },
    // Add dynamic kommune routes
    ...(await getKommuneRoutes(baseUrl)),
  ]

  return routes
}

// Helper function to generate kommune routes
async function getKommuneRoutes(baseUrl: string) {
  try {
    const kommuner = await getAppV2MunicipalitySlugs()
    
    return kommuner.map(kommune => ({
      url: `${baseUrl}/kommune/${kommune}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))
  } catch (error) {
    console.error('Error generating kommune routes:', error)
    return []
  }
} 
