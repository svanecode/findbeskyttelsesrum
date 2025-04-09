import { supabase } from '@/lib/supabase'
import { getAnvendelseskoder } from '@/lib/anvendelseskoder'
import { getKommunekoder } from '@/lib/kommunekoder'

async function getShelterCount() {
  const { count, error } = await supabase
    .from('shelters')
    .select('*', { count: 'exact', head: true })

  if (error) {
    console.error('Error counting shelters:', error)
    return 0
  }

  return count || 0
}

export default async function TestPage() {
  const [shelterCount, anvendelseskoder, kommunekoder] = await Promise.all([
    getShelterCount(),
    getAnvendelseskoder(),
    getKommunekoder()
  ])

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Database Status</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Statistik</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-gray-700">Beskyttelsesrum</h3>
              <p className="text-2xl font-bold">{shelterCount}</p>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-gray-700">Anvendelseskoder</h3>
              <p className="text-2xl font-bold">{anvendelseskoder.length}</p>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-gray-700">Kommuner</h3>
              <p className="text-2xl font-bold">{kommunekoder.length}</p>
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Anvendelseskoder</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {anvendelseskoder.map((kode) => (
                <div key={kode.kode} className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-medium">{kode.beskrivelse}</h3>
                  <p className="text-sm text-gray-600">Kode: {kode.kode}</p>
                  {kode.kategori && (
                    <p className="text-sm text-gray-600">Kategori: {kode.kategori}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Kommuner</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {kommunekoder.map((kommune) => (
                <div key={kommune.kode} className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-medium">{kommune.navn}</h3>
                  <p className="text-sm text-gray-600">Kode: {kommune.kode}</p>
                  {kommune.region && (
                    <p className="text-sm text-gray-600">Region: {kommune.region}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
} 