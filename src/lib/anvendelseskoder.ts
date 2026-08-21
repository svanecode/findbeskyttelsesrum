import { createAppV2PublicClient } from '@/lib/app-v2-public'
import { Anvendelseskode } from '@/types/anvendelseskode'
import { normalizePublicApplicationLabel } from '@/lib/public-labels'

let anvendelseskoderCache: Anvendelseskode[] | null = null

export async function getAnvendelseskoder(): Promise<Anvendelseskode[]> {
  if (anvendelseskoderCache) {
    return anvendelseskoderCache
  }

  const { data, error } = await createAppV2PublicClient()
    .from('application_code_public')
    .select('application_code, label')
    .order('label')

  if (error) {
    console.error('Error fetching app_v2 application codes:', error)
    return []
  }

  anvendelseskoderCache = (data ?? []).map((row) => ({
    kode: row.application_code,
    beskrivelse: normalizePublicApplicationLabel(row.label || row.application_code),
  }))
  return anvendelseskoderCache
}

export function getAnvendelseskodeBeskrivelse(kode: string | null, anvendelseskoder: Anvendelseskode[]): string {
  if (!kode) return ''
  const anvendelseskode = anvendelseskoder.find(a => a.kode === kode)
  return normalizePublicApplicationLabel(anvendelseskode?.beskrivelse || kode)
}
