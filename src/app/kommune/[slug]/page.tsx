import { Suspense } from 'react'
import { getCachedKommune, getCachedKommuneList } from '@/lib/cached-queries'
import KommuneMap from './map'
import MapWrapper from './map-wrapper'
import Search from '@/components/search'
import { notFound } from 'next/navigation'

interface Kommune {
  slug: string
  navn: string
  kode: string
}

interface Props {
  params: {
    slug: string
  }
}

export async function generateStaticParams() {
  try {
    const kommuner = await getCachedKommuneList() as Kommune[]
    return kommuner.map((kommune) => ({
      slug: kommune.slug,
    }))
  } catch (error) {
    console.error('Error generating static params:', error)
    return []
  }
}

export default async function KommunePage({ params }: Props) {
  try {
    const kommune = await getCachedKommune(params.slug) as Kommune

    if (!kommune) {
      console.error('No kommune found for slug:', params.slug)
      notFound()
    }

    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Beskyttelsesrum i {kommune.navn}</h1>
        
        <div className="mb-8">
          <Search />
        </div>

        <div className="h-[500px] w-full rounded-lg overflow-hidden mb-8">
          <Suspense fallback={<div className="h-full w-full bg-gray-100 animate-pulse" />}>
            <MapWrapper kommunekode={kommune.kode} />
          </Suspense>
        </div>
      </div>
    )
  } catch (error) {
    console.error('Error fetching kommune:', error)
    notFound()
  }
} 