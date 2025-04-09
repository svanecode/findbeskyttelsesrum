import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getShelterCount(): Promise<number> {
  const { count, error } = await supabase
    .from('shelters')
    .select('*', { count: 'exact', head: true })

  if (error) {
    console.error('Error counting shelters:', error)
    return 0
  }

  return count || 0
}

export async function getTotalShelterCapacity(): Promise<number> {
  const { data, error } = await supabase
    .from('shelters')
    .select('shelter_capacity')

  if (error) {
    console.error('Error fetching total shelter capacity:', error)
    return 0
  }

  return data.reduce((total, shelter) => total + (shelter.shelter_capacity || 0), 0)
} 