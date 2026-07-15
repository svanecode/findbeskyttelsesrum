import { getLegacyPublicSupabase } from "@/lib/supabase/legacy-public-client";
import { Anvendelseskode } from '@/types/anvendelseskode'
import { normalizePublicApplicationLabel } from '@/lib/public-labels'

let anvendelseskoderCache: Anvendelseskode[] | null = null

export async function getAnvendelseskoder(): Promise<Anvendelseskode[]> {
  if (anvendelseskoderCache) {
    return anvendelseskoderCache
  }

  const { data, error } = await getLegacyPublicSupabase()
    .from('anvendelseskoder')
    .select('*')
    .order('beskrivelse')

  if (error) {
    console.error('Error fetching anvendelseskoder:', error)
    return []
  }

  anvendelseskoderCache = data as Anvendelseskode[]
  return anvendelseskoderCache
}

export function getAnvendelseskodeBeskrivelse(kode: string | null, anvendelseskoder: Anvendelseskode[]): string {
  if (!kode) return ''
  const anvendelseskode = anvendelseskoder.find(a => a.kode === kode)
  return normalizePublicApplicationLabel(anvendelseskode?.beskrivelse || kode)
}
