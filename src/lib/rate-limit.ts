import { NextRequest } from 'next/server'

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

interface RateLimitState {
  tokens: number
  lastRefill: number
}

const rateLimitStore = new Map<string, RateLimitState>()

/** Best-effort token bucket per client key; not shared across serverless instances. */
export function rateLimit(
  request: NextRequest,
  config: RateLimitConfig = { maxRequests: 100, windowMs: 60000 },
  namespace = 'global',
): boolean {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
  const key = `${namespace}:${ip.split(',')[0]?.trim() || 'unknown'}`
  const now = Date.now()
  
  if (rateLimitStore.size > 10_000) {
    for (const [storedKey, storedState] of rateLimitStore) {
      if (now - storedState.lastRefill > config.windowMs * 2) rateLimitStore.delete(storedKey)
    }
  }

  let state = rateLimitStore.get(key)
  
  if (!state) {
    state = {
      tokens: config.maxRequests,
      lastRefill: now
    }
    rateLimitStore.set(key, state)
  }
  
  // Refill tokens based on time passed
  const timePassed = now - state.lastRefill
  const tokensToAdd = Math.floor(timePassed / config.windowMs) * config.maxRequests
  
  if (tokensToAdd > 0) {
    state.tokens = Math.min(config.maxRequests, state.tokens + tokensToAdd)
    state.lastRefill = now
  }
  
  if (state.tokens <= 0) {
    return false
  }
  
  state.tokens--
  return true
}
