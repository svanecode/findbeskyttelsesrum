import { NextRequest, NextResponse } from "next/server";

import { parseProductMetricPayload } from "@/lib/analytics/product-metrics";
import { recordProductMetricServer } from "@/lib/analytics/product-metrics-server";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const maximumBodyLength = 256;

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return new NextResponse(null, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }

  if (!rateLimit(request, { maxRequests: 60, windowMs: 60_000 }, "product-metrics")) {
    return new NextResponse(null, {
      status: 429,
      headers: { "Retry-After": "60", "Cache-Control": "private, no-store" },
    });
  }

  const rawBody = await request.text();
  if (rawBody.length > maximumBodyLength) {
    return new NextResponse(null, { status: 413, headers: { "Cache-Control": "private, no-store" } });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    return new NextResponse(null, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  const payload = parseProductMetricPayload(parsed);
  if (!payload) {
    return new NextResponse(null, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  const recorded = await recordProductMetricServer(payload.eventName, payload.durationMs);
  if (process.env.VERCEL_ENV === "production" && !recorded) {
    return new NextResponse(null, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
  return new NextResponse(null, { status: 202, headers: { "Cache-Control": "private, no-store" } });
}
