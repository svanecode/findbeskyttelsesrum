import { NextRequest, NextResponse } from "next/server";

import { rateLimit } from "@/lib/rate-limit";
import { nearbyTileContract, parseTileKey, type NearbyTilePayload } from "@/lib/nearby/tiles";
import { getAppV2PublicDataRevision, getAppV2PublicNearbyTile } from "@/lib/supabase/app-v2-queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A tile holds only public registration data and no visitor information. The
// CDN shares it between visitors; the lifetime matches the country map so
// moderation and imports reach every visitor within minutes.
const sharedCacheControl = "public, max-age=60, s-maxage=300, stale-while-revalidate=60";

function noStore(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ tile: string }> }) {
  // Cache misses are bounded by the number of tiles; this only stops scripted floods.
  if (!rateLimit(request, { maxRequests: 600, windowMs: 60_000 }, "nearby-tiles")) {
    return noStore({ error: "For mange forespørgsler. Vent et øjeblik, og prøv igen." }, 429);
  }

  const { tile } = await params;
  const parsed = parseTileKey(tile);
  if (!parsed) return noStore({ error: "Ugyldig kortflise." }, 400);

  try {
    const [{ markers, labels }, revision] = await Promise.all([
      getAppV2PublicNearbyTile(parsed.bounds),
      getAppV2PublicDataRevision(),
    ]);
    const payload: NearbyTilePayload = {
      contract: nearbyTileContract,
      tile,
      revision: revision.cacheKey,
      labels,
      rows: markers.map((marker) => [
        marker.slug,
        marker.addressLine1,
        marker.postalCode,
        marker.city,
        marker.latitude,
        marker.longitude,
        marker.capacity,
        marker.sourceApplicationCode,
      ]),
    };
    return NextResponse.json(payload, { headers: { "Cache-Control": sharedCacheControl } });
  } catch (error) {
    console.error("[nearby-tiles] Failed to load tile:", error instanceof Error ? error.name : "unknown");
    return noStore({ error: "Kortflisen kunne ikke hentes." }, 502);
  }
}
