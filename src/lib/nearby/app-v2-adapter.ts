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
  statuses?: Array<"active" | "temporarily_closed" | "under_review">
  importStates?: Array<"active" | "missing_from_source" | "suppressed">
  representativeShelter?: { slug: string; status?: "active" | "temporarily_closed" | "under_review" }
  shelterSlugs?: string[]
}

export type NearbyResultShelter = {
  id: string
  location: { type: string; coordinates: number[] } | null
  vejnavn: string | null
  husnummer: string | null
  postnummer: string | null
  city: string | null
  kommunekode: string | null
  anvendelse: string | null
  typeLabel?: string | null
  shelter_count?: number
  total_capacity?: number
  distance: number
  address: string | null
  source: 'legacy' | 'app_v2'
  statuses?: Array<"active" | "temporarily_closed" | "under_review">
  representativeSlug?: string | null
  // Legacy-only fields — absent for app_v2 results
  created_at?: string
  bygning_id?: string | null
  shelter_capacity?: number | null
  deleted?: string | null
  last_checked?: string | null
  anvendelseskoder?: { kode: string; beskrivelse: string; skal_med: boolean }
}

/**
 * Translates grouped app_v2 nearby API results into the legacy-shaped UI contract.
 * app_v2 does not expose a legacy `anvendelse` code here, so the legacy Type card
 * stays hidden until a dedicated app_v2 type-display contract is added.
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
      city: row.address.city,
      kommunekode: row.municipality?.code ?? null,
      anvendelse: null,
      typeLabel: row.applicationCodeLabel,
      shelter_count: row.shelterCount,
      total_capacity: row.totalCapacity,
      distance: row.distanceMeters / 1000,
      address: `${row.address.line1}, ${row.address.postalCode} ${row.address.city}`,
      source: 'app_v2',
      statuses: row.statuses ?? [],
      representativeSlug: row.representativeShelter?.slug ?? row.shelterSlugs?.[0] ?? null,
    }
  })
}
