export interface Shelter {
  id: string
  created_at: string
  bygning_id: string | null
  kommunekode: string | null
  shelter_capacity: number | null
  location: {
    type: string
    coordinates: number[]
  } | null
  anvendelse: string | null
  husnummer: string | null
  vejnavn: string | null
  postnummer: string | null
  address: string | null
  deleted: string | null
  last_checked: string | null
  shelter_count?: number
  total_capacity?: number
  anvendelseskoder?: {
    kode: string
    beskrivelse: string
    skal_med: boolean
  }
} 