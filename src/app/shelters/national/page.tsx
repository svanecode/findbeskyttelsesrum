import MapWrapper from '@/components/map-wrapper'
import Search from '@/components/search'

export default function NationalSheltersPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Beskyttelsesrum i Danmark</h1>
      
      <div className="mb-8">
        <Search />
      </div>

      <div className="h-[500px] w-full rounded-lg overflow-hidden mb-8">
        <MapWrapper />
      </div>
    </div>
  )
} 