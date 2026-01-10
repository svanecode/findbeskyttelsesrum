import { NextResponse } from 'next/server'
import { getShelterCount } from '@/lib/supabase'

export const revalidate = 3600 // Revalidate every hour

export async function GET() {
  try {
    const count = await getShelterCount()
    
    // Validate count is a valid positive number
    // If count is 0 or invalid, it likely means an error occurred in getShelterCount
    // (which returns 0 on error), so we should return an error status
    if (!count || count <= 0) {
      console.error('Invalid shelter count returned:', count)
      return NextResponse.json(
        { error: 'Invalid shelter count', count: null },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ count }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
      }
    })
  } catch (error) {
    console.error('Error fetching shelter count:', error)
    return NextResponse.json(
      { error: 'Failed to fetch shelter count', count: null },
      { status: 500 }
    )
  }
}
