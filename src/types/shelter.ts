export interface Shelter {
  id: string
  created_at: string
  bygning_id: string | null
  kommunekode: string | null
  shelter_capacity: number | null
  total_capacity: number | null
  address: string | null
  postnummer: string | null
  vejnavn: string | null
  husnummer: string | null
  location: {
    type: string
    coordinates: [number, number]
  } | null
  anvendelse: string | null
  created_by: string | null
  updated_by: string | null
  distance?: number // Distance in meters from PostGIS
  shelter_count?: number // Number of shelters at the same location
} 