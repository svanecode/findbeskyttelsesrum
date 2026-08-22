import { NextRequest, NextResponse } from 'next/server'

import { consumeDistributedRateLimit } from '@/lib/distributed-rate-limit'
import { parseAndSanitizeClientErrorReport } from '@/lib/errors/sanitize-client-error'
import { rateLimit } from '@/lib/rate-limit'
import { recordProductMetricServer } from '@/lib/analytics/product-metrics-server'

export const runtime = 'nodejs'

const maximumBodyBytes = 48_000

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return true

  try {
    return new URL(origin).host === request.nextUrl.host
  } catch {
    return false
  }
}

function privateResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return privateResponse({ error: 'Forbidden' }, 403)
  }

  if (!rateLimit(request, { maxRequests: 40, windowMs: 60_000 }, 'client-errors')) {
    const response = privateResponse({ error: 'Too many requests' }, 429)
    response.headers.set('Retry-After', '60')
    return response
  }

  const sharedLimit = await consumeDistributedRateLimit(
    request,
    { maxRequests: 40, windowMs: 60_000 },
    'client-errors',
  )
  if (!sharedLimit.allowed) {
    const response = privateResponse({ error: 'For mange fejlrapporter på kort tid' }, 429)
    response.headers.set('Retry-After', String(sharedLimit.retryAfterSeconds))
    return response
  }

  try {
    const declaredLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) {
      return privateResponse({ error: 'Payload too large' }, 413)
    }

    const rawText = await request.text()
    if (new TextEncoder().encode(rawText).byteLength > maximumBodyBytes) {
      return privateResponse({ error: 'Payload too large' }, 413)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(rawText) as unknown
    } catch {
      return privateResponse({ error: 'Invalid JSON' }, 400)
    }

    const errorReport = parseAndSanitizeClientErrorReport(parsed)
    if (!errorReport) return privateResponse({ error: 'Invalid error report' }, 400)

    console.error('[CLIENT_ERROR]', {
      message: errorReport.message,
      url: errorReport.url,
      timestamp: errorReport.timestamp,
      context: errorReport.context,
      stack: errorReport.stack,
    })

    await recordProductMetricServer('client_error')

    return privateResponse({ success: true }, 200)
  } catch (error) {
    console.error('Error in error tracking endpoint:', error instanceof Error ? error.name : 'unknown')
    return privateResponse({ error: 'Internal server error' }, 500)
  }
}
