import { createClient } from '@supabase/supabase-js'
import { cachedQuery, generateCacheKey } from './cache'

// Ensure environment variables are available and properly typed
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing required environment variables for Supabase configuration')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'present' : 'missing')
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'present' : 'missing')
  
  // In development, provide more helpful error messages
  if (process.env.NODE_ENV === 'development') {
    throw new Error('Missing required Supabase environment variables. Check .env file.')
  }
  
  // In production, use fallback values or handle gracefully
  throw new Error('Database configuration error')
}

// Initialize Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false // Since we're using this on the server side
  }
})

export async function getAllKommuneSlugs(): Promise<string[]> {
  return cachedQuery(
    generateCacheKey('kommunekoder', { slugs: true }),
    async () => {
      const { data, error } = await supabase
        .from('kommunekoder')
        .select('slug')
        .order('slug')

      if (error) {
        console.error('Error fetching kommune slugs:', error)
        return []
      }

      return data.map(kommune => kommune.slug)
    }
  )
}

export async function getShelterCount(): Promise<number> {
  return cachedQuery(
    generateCacheKey('shelters', { count: true }),
    async () => {
      const { count, error } = await supabase
        .from('shelters')
        .select('*', { count: 'exact', head: true })

      if (error) {
        console.error('Error counting shelters:', error)
        return 0
      }

      return count || 0
    }
  )
}

export async function getTotalShelterCapacity(): Promise<number> {
  return cachedQuery(
    generateCacheKey('shelters', { capacity: true }),
    async () => {
      const { data, error } = await supabase
        .from('shelters')
        .select('shelter_capacity')

      if (error) {
        console.error('Error fetching total shelter capacity:', error)
        return 0
      }

      return data.reduce((total, shelter) => total + (shelter.shelter_capacity || 0), 0)
    }
  )
} 