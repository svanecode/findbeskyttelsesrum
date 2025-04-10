import MapWrapper from './map-wrapper'

export default async function Page({
  searchParams
}: {
  searchParams: { lat: string; lng: string }
}) {
  // Ensure we're working with string values
  const lat = searchParams?.lat?.toString() || ''
  const lng = searchParams?.lng?.toString() || ''

  // Validate the parameters
  if (!lat || !lng || isNaN(Number(lat)) || isNaN(Number(lng))) {
    return (
      <main className="min-h-screen bg-[#1a1a1a] text-white">
        <div className="max-w-7xl mx-auto p-4">
          <h1 className="text-3xl font-bold mb-8">Ugyldig position</h1>
          <p className="text-gray-400">
            Du skal angive gyldige værdier for både breddegrad (lat) og længdegrad (lng) i URL'en.
          </p>
        </div>
      </main>
    )
  }

  return <MapWrapper lat={lat} lng={lng} />
} 