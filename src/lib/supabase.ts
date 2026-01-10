import { createClient } from '@supabase/supabase-js'
import { cachedQuery, generateCacheKey } from './cache'

// Ensure environment variables are available and properly typed
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  if (process.env.NODE_ENV === 'development') {
    console.error('Missing required environment variables for Supabase configuration')
    console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'present' : 'missing')
    console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'present' : 'missing')
  }
  
  // In development, provide more helpful error messages
  if (process.env.NODE_ENV === 'development') {
    throw new Error('Missing required Supabase environment variables. Check .env file.')
  }
}

// Initialize Supabase client with retry configuration
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: false // Since we're using this on the server side
  },
  global: {
    headers: {
      'x-application-name': 'findbeskyttelsesrum'
    }
  },
  db: {
    schema: 'public'
  }
})

// Add retry logic for RPC calls
const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1 second

interface SupabaseRPCResponse<T> {
  data: T | null
  error: any | null
}

export async function retryRPC<T>(fn: () => Promise<SupabaseRPCResponse<T>>): Promise<SupabaseRPCResponse<T>> {
  let lastError: Error | null = null
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (process.env.NODE_ENV === 'development') {
        console.error(`Attempt ${i + 1} failed:`, error)
      }
      
      if (i < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1)))
      }
    }
  }
  
  throw lastError
}

export async function getAllKommuneSlugs(): Promise<string[]> {
  return cachedQuery(
    generateCacheKey('kommunekoder', { slugs: true }),
    async () => {
      const { data, error } = await supabase
        .from('kommunekoder')
        .select('slug')
        .order('slug')

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching kommune slugs:', error)
        }
        return []
      }

      return data.map(kommune => kommune.slug)
    }
  )
}

export async function getShelterCount(): Promise<number> {
  return cachedQuery(
    generateCacheKey('sheltersv2', { capacity_sum: true, active: true }),
    async () => {
      // Use RPC function to get total capacity - this is efficient and avoids fetching all records
      const response = await retryRPC<number>(async () => {
        return await supabase.rpc('get_total_shelter_capacity')
      })

      if (response.error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error getting total shelter capacity:', response.error)
        }
        return 0
      }

      return response.data || 0
    }
  )
}

export async function getTotalShelterCapacity(): Promise<number> {
  return cachedQuery(
    generateCacheKey('sheltersv2', { capacity: true, active: true }),
    async () => {
      const { data, error } = await supabase
        .from('sheltersv2')
        .select('shelter_capacity')
        .is('deleted', null) // Only count capacity from active (non-deleted) shelters

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching total shelter capacity:', error)
        }
        return 0
      }

      return data.reduce((total, shelter) => total + (shelter.shelter_capacity || 0), 0)
    }
  )
} 