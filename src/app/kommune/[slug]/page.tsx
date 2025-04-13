import { Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import KommuneMap from './map'
import MapWrapper from './map-wrapper'
import Search from '@/components/search'
import { notFound } from 'next/navigation'

interface Props {
  params: {
    slug: string
  }
}

export async function generateStaticParams() {
  const { data: kommunekoder } = await supabase
    .from('kommunekoder')
    .select('slug')
  
  return (kommunekoder || []).map((kommune) => ({
    slug: kommune.slug,
  }))
}

export default async function KommunePage({ params }: Props) {
  const { slug } = params
  
  // Find kommune by slug
  const { data: kommune, error } = await supabase
    .from('kommunekoder')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !kommune) {
    console.log('No kommune found for slug:', slug)
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
} 