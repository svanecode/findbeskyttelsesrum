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

export function rateLimit(
  request: NextRequest,
  config: RateLimitConfig = { maxRequests: 100, windowMs: 60000 }
): boolean {
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
  const now = Date.now()
  
  let state = rateLimitStore.get(ip)
  
  if (!state) {
    state = {
      tokens: config.maxRequests,
      lastRefill: now
    }
    rateLimitStore.set(ip, state)
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