import { supabase } from '@/lib/supabase'
import { Shelter } from '@/types/shelter'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from '@/lib/anvendelseskoder'
import { getKommunekoder, getKommunenavn } from '@/lib/kommunekoder'

async function getShelter(id: string) {
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    console.error('Invalid UUID format:', id)
    return null
  }

  const { data, error } = await supabase
    .from('shelters')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    console.error('Error fetching shelter:', error)
    return null
  }

  return data as Shelter
}

export default async function ShelterPage({
  params,
}: {
  params: { id: string }
}) {
  const [shelter, anvendelseskoder, kommunekoder] = await Promise.all([
    getShelter(params.id),
    getAnvendelseskoder(),
    getKommunekoder()
  ])

  if (!shelter) {
    notFound()
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/"
          className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
        >
          ← Tilbage til oversigten
        </Link>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-3xl font-bold mb-4">
            {shelter.vejnavn} {shelter.husnummer}
          </h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-xl font-semibold mb-2">Adresse</h2>
              <p className="text-gray-600 mb-2">{shelter.address}</p>
              <p className="text-gray-600">
                {shelter.postnummer} {getKommunenavn(shelter.kommunekode, kommunekoder)}
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-2">Information</h2>
              <p className="text-gray-600 mb-2">
                Kapacitet: {shelter.shelter_capacity} personer
              </p>
              {shelter.anvendelse && (
                <p className="text-gray-600">
                  Anvendelse: {getAnvendelseskodeBeskrivelse(shelter.anvendelse, anvendelseskoder)}
                </p>
              )}
            </div>
          </div>

          {shelter.location && (
            <div className="mt-6">
              <h2 className="text-xl font-semibold mb-2">Koordinater</h2>
              <p className="text-gray-600">
                {shelter.location.coordinates[1]}, {shelter.location.coordinates[0]}
              </p>
            </div>
          )}

          <div className="mt-6 text-sm text-gray-500">
            <p>Oprettet: {new Date(shelter.created_at).toLocaleString('da-DK')}</p>
            {shelter.bygning_id && (
              <p>Bygning ID: {shelter.bygning_id}</p>
            )}
            {shelter.kommunekode && (
              <p>Kommune: {getKommunenavn(shelter.kommunekode, kommunekoder)}</p>
            )}
          </div>
        </div>
      </div>
    </main>
  )
} 