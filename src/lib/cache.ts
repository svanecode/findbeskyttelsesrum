import { supabase } from './supabase'

// Cache duration in seconds
const CACHE_DURATION = 60 * 60 * 24 * 30 // 30 days

interface CacheEntry<T> {
  data: T
  timestamp: number
}

const cache: Record<string, CacheEntry<any>> = {}

export async function cachedQuery<T>(
  key: string,
  queryFn: () => Promise<T>,
  duration: number = CACHE_DURATION
): Promise<T> {
  const now = Date.now()
  const cached = cache[key]

  if (cached && now - cached.timestamp < duration * 1000) {
    return cached.data
  }

  const data = await queryFn()
  cache[key] = {
    data,
    timestamp: now,
  }

  return data
}

// Helper function to generate cache keys
export function generateCacheKey(table: string, params: Record<string, any>): string {
  return `${table}:${JSON.stringify(params)}`
} 