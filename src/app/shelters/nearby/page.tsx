import MapWrapper from './map-wrapper'

export default async function Page({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  // Ensure we're working with string values
  const lat = typeof searchParams.lat === 'string' ? searchParams.lat : ''
  const lng = typeof searchParams.lng === 'string' ? searchParams.lng : ''

  // Only validate if both parameters are present
  if (lat && lng) {
    const latNum = Number(lat)
    const lngNum = Number(lng)
    
    // Check if coordinates are valid
    if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return (
        <main className="min-h-screen bg-[#1a1a1a] text-white">
          <div className="max-w-7xl mx-auto p-4">
            <h1 className="text-3xl font-bold mb-8">Ugyldig position</h1>
            <p className="text-gray-400">
              De angivne koordinater er ugyldige. Prøv at søge efter en adresse eller bruge din nuværende position.
            </p>
          </div>
        </main>
      )
    }
  }

  return <MapWrapper lat={lat} lng={lng} />
} 