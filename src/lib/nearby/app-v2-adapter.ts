// API response shape returned by /api/app-v2/nearby/grouped
type ApiGroupedResult = {
  groupKey: string
  address: { line1: string; postalCode: string; city: string }
  coordinates: { latitude: number | null; longitude: number | null }
  distanceMeters: number
  shelterCount: number
  totalCapacity: number
  applicationCodeLabel: string | null
  municipality: { code: string | null; name: string; slug: string; id: string }
}

export type NearbyResultShelter = {
  id: string
  location: { type: string; coordinates: number[] } | null
  vejnavn: string | null
  husnummer: string | null
  postnummer: string | null
  kommunekode: string | null
  anvendelse: string | null
  shelter_count?: number
  total_capacity?: number
  distance: number
  address: string | null
  source: 'legacy' | 'app_v2'
  // Legacy-only fields — absent for app_v2 results
  created_at?: string
  bygning_id?: string | null
  shelter_capacity?: number | null
  deleted?: string | null
  last_checked?: string | null
  anvendelseskoder?: { kode: string; beskrivelse: string; skal_med: boolean }
}

/**
 * Translates the grouped app_v2 nearby API response into the shape expected by the
 * legacy nearby UI. `anvendelse` is mapped from `applicationCodeLabel` when available;
 * null when the group has no source application code or no matching label.
 */
export function adaptAppV2Grouped(rows: ApiGroupedResult[]): NearbyResultShelter[] {
  return rows.map((row) => {
    const parts = row.address.line1.split(' ')
    const husnummer = parts.length > 1 ? parts[parts.length - 1] : ''
    const vejnavn = parts.length > 1 ? parts.slice(0, -1).join(' ') : row.address.line1

    const { latitude, longitude } = row.coordinates
    const location: NearbyResultShelter['location'] =
      latitude != null && longitude != null
        ? { type: 'Point', coordinates: [longitude, latitude] }
        : null

    return {
      id: row.groupKey,
      location,
      vejnavn,
      husnummer,
      postnummer: row.address.postalCode,
      kommunekode: row.municipality?.code ?? null,
      anvendelse: row.applicationCodeLabel ?? null,
      shelter_count: row.shelterCount,
      total_capacity: row.totalCapacity,
      distance: row.distanceMeters / 1000,
      address: `${row.address.line1}, ${row.address.postalCode} ${row.address.city}`,
      source: 'app_v2',
    }
  })
}
