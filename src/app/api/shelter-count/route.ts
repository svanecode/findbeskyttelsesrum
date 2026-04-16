import { NextResponse } from 'next/server'
import { getAppV2TotalShelterCapacity } from '@/lib/supabase/app-v2-queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const count = await getAppV2TotalShelterCapacity()
    
    // Validate count is a valid positive number
    // If count is 0 or invalid, it likely means app_v2 is not populated or the query failed.
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
