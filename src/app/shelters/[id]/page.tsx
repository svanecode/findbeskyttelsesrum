import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ShelterDetail from './client'
import { Shelter } from '@/types/shelter'
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from '@/lib/anvendelseskoder'
import { getKommunekoder, getKommunenavn } from '@/lib/kommunekoder'

export const metadata: Metadata = {
  title: 'Beskyttelsesrum detaljer',
  description: 'Se detaljer om beskyttelsesrummet',
}

type Props = {
  params: { id: string }
  searchParams: { [key: string]: string | string[] | undefined }
}

export default async function Page({ params }: Props) {
  const { data: shelter, error } = await supabase
    .from('shelters')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !shelter) {
    notFound()
  }

  const [anvendelseskoder, kommunekoder] = await Promise.all([
    getAnvendelseskoder(),
    getKommunekoder()
  ])

  return (
    <ShelterDetail 
      shelter={shelter as Shelter} 
      anvendelseskoder={anvendelseskoder}
      kommunekoder={kommunekoder}
    />
  )
}