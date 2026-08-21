import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";

import { createAppV2AdminClient } from "@/lib/supabase/app-v2";

type DistributedRateLimitConfig = {
  maxRequests: number;
  windowMs: number;
};

type RateLimitRow = {
  allowed: boolean;
  remaining: number | string;
  reset_at: string;
};

export type DistributedRateLimitDecision = {
  available: boolean;
  allowed: boolean;
  remaining: number | null;
  retryAfterSeconds: number;
};

function getClientAddress(request: NextRequest) {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-forwarded-for")
    ?? request.headers.get("x-real-ip");

  return forwarded?.split(",", 1)[0]?.trim() || null;
}

function unavailableDecision(windowMs: number): DistributedRateLimitDecision {
  return {
    available: false,
    allowed: true,
    remaining: null,
    retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1_000)),
  };
}

function getRateLimitHashSecret() {
  const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;

  const isProduction = process.env.VERCEL_ENV === "production"
    || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production");
  if (isProduction) {
    throw new Error("RATE_LIMIT_HASH_SECRET must contain at least 32 characters in production.");
  }

  return `findbeskyttelsesrum-non-production-rate-limit-secret-v1:${process.env.VERCEL_DEPLOYMENT_ID ?? "local"}`;
}

/**
 * Shared database-backed limiter for expensive or write-oriented API routes.
 * It fails open to the existing in-process limiter if Supabase is unavailable.
 */
export async function consumeDistributedRateLimit(
  request: NextRequest,
  config: DistributedRateLimitConfig,
  namespace: string,
): Promise<DistributedRateLimitDecision> {
  const clientAddress = getClientAddress(request);
  if (!clientAddress) return unavailableDecision(config.windowMs);

  const windowSeconds = Math.max(1, Math.min(86_400, Math.ceil(config.windowMs / 1_000)));
  const maxRequests = Math.max(1, Math.min(10_000, Math.trunc(config.maxRequests)));

  try {
    const keyHash = createHmac("sha256", getRateLimitHashSecret())
      .update(`findbeskyttelsesrum:rate-limit:v1:${namespace}:${clientAddress}`)
      .digest("hex");

    const admin = createAppV2AdminClient();
    const { data, error } = await admin.rpc("consume_rate_limit", {
      p_key_hash: keyHash,
      p_limit: maxRequests,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error("[rate-limit] Distributed limiter failed:", { namespace, code: error.code });
      return unavailableDecision(config.windowMs);
    }

    const row = (Array.isArray(data) ? data[0] : data) as RateLimitRow | null;
    if (!row || typeof row.allowed !== "boolean") {
      console.error("[rate-limit] Distributed limiter returned an invalid response:", { namespace });
      return unavailableDecision(config.windowMs);
    }

    const resetTime = new Date(row.reset_at).getTime();
    const retryAfterSeconds = Number.isFinite(resetTime)
      ? Math.max(1, Math.ceil((resetTime - Date.now()) / 1_000))
      : windowSeconds;

    return {
      available: true,
      allowed: row.allowed,
      remaining: Math.max(0, Math.trunc(Number(row.remaining) || 0)),
      retryAfterSeconds,
    };
  } catch (error) {
    console.error("[rate-limit] Distributed limiter unavailable:", {
      namespace,
      error: error instanceof Error ? error.name : "unknown",
    });
    return unavailableDecision(config.windowMs);
  }
}
