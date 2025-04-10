'use client'

import { Shelter } from '@/types/shelter'
import { Anvendelseskode } from '@/types/anvendelseskode'
import { Kommunekode } from '@/types/kommunekode'

type Props = {
  shelter: Shelter
  anvendelseskoder: Anvendelseskode[]
  kommunekoder: Kommunekode[]
}

export default function ShelterDetail({ shelter, anvendelseskoder, kommunekoder }: Props) {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Beskyttelsesrum detaljer</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h2 className="text-lg font-semibold mb-2">Grundlæggende information</h2>
            <p><span className="font-medium">ID:</span> {shelter.id}</p>
            <p><span className="font-medium">Adresse:</span> {shelter.address}</p>
            <p><span className="font-medium">Postnummer:</span> {shelter.postnummer}</p>
            <p><span className="font-medium">Vejnavn:</span> {shelter.vejnavn}</p>
            <p><span className="font-medium">Husnummer:</span> {shelter.husnummer}</p>
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-2">Yderligere information</h2>
            <p><span className="font-medium">Anvendelse:</span> {shelter.anvendelse}</p>
            <p><span className="font-medium">Kommunekode:</span> {shelter.kommunekode}</p>
            <p><span className="font-medium">Kapacitet:</span> {shelter.shelter_capacity} personer</p>
          </div>
        </div>
      </div>
    </div>
  )
} 