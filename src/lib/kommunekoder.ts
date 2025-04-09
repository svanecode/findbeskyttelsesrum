import { supabase } from './supabase'
import { Kommunekode } from '@/types/kommunekode'

let kommunekoderCache: Kommunekode[] | null = null

export async function getKommunekoder(): Promise<Kommunekode[]> {
  if (kommunekoderCache) {
    return kommunekoderCache
  }

  const { data, error } = await supabase
    .from('kommunekoder')
    .select('*')
    .order('navn')

  if (error) {
    console.error('Error fetching kommunekoder:', error)
    return []
  }

  kommunekoderCache = data as Kommunekode[]
  return kommunekoderCache
}

export function getKommunenavn(kode: string | null, kommunekoder: Kommunekode[]): string {
  if (!kode) return ''
  const kommunekode = kommunekoder.find(k => k.kode === kode)
  return kommunekode?.navn || kode
} 