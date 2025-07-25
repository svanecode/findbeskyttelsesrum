import { MetadataRoute } from 'next'
import { getAllKommuneSlugs } from '@/lib/supabase'

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
    // Add dynamic kommune routes
    ...(await getKommuneRoutes(baseUrl)),
  ]

  return routes
}

// Helper function to generate kommune routes
async function getKommuneRoutes(baseUrl: string) {
  try {
    const kommuner = await getAllKommuneSlugs()
    
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