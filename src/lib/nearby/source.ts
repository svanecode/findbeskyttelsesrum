export type NearbySource = 'app_v2' | 'legacy'

export const defaultNearbySource: NearbySource = 'app_v2'

export function resolveNearbySource(value: string | null | undefined): NearbySource {
  return value === 'legacy' ? 'legacy' : defaultNearbySource
}
