import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://findbeskyttelsesrum.dk'
  
  const routes = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/shelters/national`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.9,
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
    ...getKommuneRoutes(baseUrl),
  ]

  return routes
}

// Helper function to generate kommune routes
function getKommuneRoutes(baseUrl: string) {
  // This would typically come from your database or API
  const kommuner = [
    // Hovedstadsområdet
    'københavn',
    'frederiksberg',
    'gentofte',
    'lyngby-taarbæk',
    'hvidovre',
    'rødovre',
    'gladsaxe',
    'ballerup',
    'brøndby',
    'taastrup',
    'høje-taastrup',
    'herlev',
    'søborg',
    'valby',
    'vesterbro',
    'nørrebro',
    'østerbro',
    'amager',
    'nordhavn',
    'sydhavn',
    'christianshavn',
    
    // Østsjælland
    'roskilde',
    'køge',
    'greve',
    'solrød',
    'høje-taastrup',
    'hvidovre',
    'ishøj',
    'vallensbæk',
    
    // Nordsjælland
    'hillerød',
    'helsingør',
    'frederikssund',
    'frederiksværk',
    'hørsholm',
    'birkerød',
    'farum',
    'ballerup',
    'søllerød',
    'værløse',
    'allerød',
    'fredensborg',
    'humlebæk',
    'nivå',
    'kokkedal',
    'hornbæk',
    'gilleleje',
    
    // Midtjylland
    'aarhus',
    'randers',
    'silkeborg',
    'skanderborg',
    'horsens',
    'viborg',
    'holstebro',
    'herning',
    'grenaa',
    'skive',
    
    // Syddanmark
    'odense',
    'svendborg',
    'nyborg',
    'middelfart',
    'assens',
    'faaborg',
    'kerteminde',
    'nordfyns',
    
    // Nordjylland
    'aalborg',
    'hobro',
    'thisted',
    'frederikshavn',
    'skagen',
    'hirtshals',
    'brønderslev',
    'hadsund',
    
    // Sjælland
    'holbæk',
    'kalundborg',
    'ringsted',
    'slagelse',
    'sorø',
    'næstved',
    'vordingborg',
    'faxe',
    'stevns',
    
    // Bornholm
    'rønne',
    'nexø',
    'aakirkeby',
    'hasle',
    'allinge-sandvig',
  ]

  return kommuner.map(kommune => ({
    url: `${baseUrl}/kommune/${kommune}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))
} 