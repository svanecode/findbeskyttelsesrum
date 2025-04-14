import { supabase } from './supabase'

type FilterOperator = 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'like' | 'ilike' | 'is'

interface QueryParams {
  table: string
  query: string
  params?: {
    single?: boolean
    limit?: number
    count?: boolean
  }
  filters?: Array<{
    column: string
    operator: FilterOperator
    value: unknown
  }>
}

export async function cachedQuery<T>({ table, query, params, filters }: QueryParams): Promise<T> {
  const { data, error } = await supabase.functions.invoke('cached-queries', {
    body: { table, query, params, filters },
  })

  if (error) {
    console.error('Cache query error:', error)
    throw error
  }

  return data.data
}

// Example usage for kommune queries
export async function getCachedKommune(slug: string) {
  return cachedQuery({
    table: 'kommunekoder',
    query: '*',
    filters: [
      {
        column: 'slug',
        operator: 'eq',
        value: slug,
      },
    ],
    params: {
      single: true,
    },
  })
}

export async function getCachedKommuneList() {
  return cachedQuery({
    table: 'kommunekoder',
    query: 'slug,navn,kode',
  })
}

export async function getCachedShelterCount() {
  return cachedQuery({
    table: 'shelters',
    query: '*',
    params: {
      count: true,
    },
  })
}

export async function getCachedSheltersByKommune(kommunekode: string) {
  return cachedQuery({
    table: 'shelters',
    query: '*',
    filters: [
      {
        column: 'kommunekode',
        operator: 'eq',
        value: kommunekode,
      },
    ],
  })
}

export async function getCachedTotalShelterCapacity() {
  return cachedQuery({
    table: 'shelters',
    query: 'shelter_capacity',
  })
} 