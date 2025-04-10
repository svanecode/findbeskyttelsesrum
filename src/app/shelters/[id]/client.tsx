'use client'

import { Shelter } from '@/types/shelter'
import { getAnvendelseskodeBeskrivelse } from '@/lib/anvendelseskoder'
import { getKommunenavn } from '@/lib/kommunekoder'
import Link from 'next/link'

interface Props {
  shelter: Shelter
  anvendelseskoder: any[]
  kommunekoder: any[]
}

export default function ShelterDetail({ shelter, anvendelseskoder, kommunekoder }: Props) {
  return (
    <main className="min-h-screen bg-[#1a1a1a] text-white">
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex items-center mb-6">
          <Link
            href="/"
            className="text-gray-400 hover:text-white transition-colors mr-4"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold">Beskyttelsesrum detaljer</h1>
        </div>

        <div className="bg-[#1f1f1f] rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">{shelter.vejnavn} {shelter.husnummer}</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium mb-3">Adresse</h3>
              <p className="text-gray-300">
                {shelter.vejnavn} {shelter.husnummer}<br />
                {shelter.postnummer} {getKommunenavn(shelter.kommunekode, kommunekoder)}
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-3">Kapacitet</h3>
              <p className="text-gray-300">{shelter.shelter_capacity} personer</p>
            </div>

            {shelter.anvendelse && (
              <div>
                <h3 className="text-lg font-medium mb-3">Type</h3>
                <p className="text-gray-300">{getAnvendelseskodeBeskrivelse(shelter.anvendelse, anvendelseskoder)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
} 