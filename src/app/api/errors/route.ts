import { NextRequest, NextResponse } from 'next/server'

import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const MAX_BODY_CHARS = 48_000
const MAX_MESSAGE = 4_000
const MAX_STACK = 12_000
const MAX_URL = 2_048
const MAX_USER_AGENT = 512
const MAX_CONTEXT_JSON = 8_000

interface ErrorReport {
  message: string
  stack?: string
  url: string
  userAgent: string
  timestamp: string
  userId?: string
  context?: Record<string, unknown>
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…[truncated]`
}

function sanitizeReport(raw: ErrorReport): ErrorReport {
  return {
    message: truncate(String(raw.message), MAX_MESSAGE),
    stack: raw.stack !== undefined ? truncate(String(raw.stack), MAX_STACK) : undefined,
    url: truncate(String(raw.url ?? ''), MAX_URL),
    userAgent: truncate(String(raw.userAgent ?? ''), MAX_USER_AGENT),
    timestamp: String(raw.timestamp),
    userId: raw.userId !== undefined ? truncate(String(raw.userId), 256) : undefined,
    context: sanitizeContext(raw.context),
  }
}

function sanitizeContext(context: Record<string, unknown> | undefined) {
  if (!context || typeof context !== 'object') return undefined
  try {
    const json = JSON.stringify(context)
    if (json.length <= MAX_CONTEXT_JSON) {
      return JSON.parse(json) as Record<string, unknown>
    }
    return { _truncated: truncate(json, MAX_CONTEXT_JSON) } as Record<string, unknown>
  } catch {
    return { _error: 'context_not_serializable' }
  }
}

async function forwardToWebhook(payload: ErrorReport) {
  const url = process.env.ERROR_WEBHOOK_URL
  if (!url || typeof url !== 'string') return

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 5_000)
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch {
    // Avoid throwing from logging path
  } finally {
    clearTimeout(t)
  }
}

export async function POST(request: NextRequest) {
  if (!rateLimit(request, { maxRequests: 40, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const rawText = await request.text()
    if (rawText.length > MAX_BODY_CHARS) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(rawText) as ErrorReport
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({ error: 'Invalid error report' }, { status: 400 })
    }

    const incoming = parsed as ErrorReport
    if (!incoming.message || !incoming.timestamp) {
      return NextResponse.json({ error: 'Invalid error report' }, { status: 400 })
    }

    const errorReport = sanitizeReport(incoming)

    console.error('[CLIENT_ERROR]', {
      message: errorReport.message,
      url: errorReport.url,
      timestamp: errorReport.timestamp,
      userAgent: errorReport.userAgent,
      context: errorReport.context,
      stack: errorReport.stack,
    })

    await forwardToWebhook(errorReport)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in error tracking endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
