import type { NextRequest } from "next/server";

/**
 * Client address for rate limiting. On Vercel, x-vercel-forwarded-for is set
 * by the platform and cannot be spoofed; the others are local/dev fallbacks.
 */
export function getClientAddress(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-forwarded-for")
    ?? request.headers.get("x-real-ip");

  return forwarded?.split(",", 1)[0]?.trim() || null;
}

/**
 * Browsers always send Origin on cross-site POSTs, so a present Origin must
 * match this host. Requests without Origin (non-browser clients) are allowed
 * and rely on rate limits instead.
 */
export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}
