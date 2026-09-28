import { NextRequest, NextResponse } from "next/server";

import { rateLimit } from "@/lib/rate-limit";
import { nearbyTileContract, parseTileKey, revisionCounter, type NearbyTilePayload } from "@/lib/nearby/tiles";
import { getAppV2PublicDataRevision, getAppV2PublicNearbyTile } from "@/lib/supabase/app-v2-queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A tile holds only public registration data and no visitor information. The
// CDN shares it between visitors; the lifetime matches the country map so
// moderation and imports reach every visitor within minutes.
const sharedCacheControl = "public, max-age=60, s-maxage=300, stale-while-revalidate=60";
// /tiles/<tile>/<revision> is only answered while that revision is current, so
// its content never changes and the CDN can keep it. Clients use it to refresh
// the tiles that are still cached from before a publication.
const pinnedCacheControl = "public, max-age=3600, s-maxage=86400";

function noStore(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tile: string; revision?: string[] }> },
) {
  // Cache misses are bounded by the number of tiles; this only stops scripted floods.
  if (!rateLimit(request, { maxRequests: 600, windowMs: 60_000 }, "nearby-tiles")) {
    return noStore({ error: "For mange forespørgsler. Vent et øjeblik, og prøv igen." }, 429);
  }

  // The CDN caches by full URL. Query strings would let a client mint
  // unlimited cache misses for the same tile, so none are accepted.
  if (request.nextUrl.search) return noStore({ error: "Kortflisen tager ingen parametre." }, 400);

  const { tile, revision: revisionSegments } = await params;
  const parsed = parseTileKey(tile);
  if (!parsed) return noStore({ error: "Ugyldig kortflise." }, 400);

  let pinnedRevision: number | null = null;
  if (revisionSegments) {
    const [segment, ...rest] = revisionSegments;
    if (rest.length > 0 || !segment || !/^[1-9]\d{0,14}$/.test(segment)) {
      return noStore({ error: "Ugyldig dataversion." }, 400);
    }
    pinnedRevision = Number(segment);
  }

  try {
    // The tile is built from several reads. If an import or moderation change
    // lands in between, the rows could mix two datasets, so the revision is
    // read before and after and a changed revision is never cached.
    const revisionBefore = await getAppV2PublicDataRevision();
    const currentRevision = revisionCounter(revisionBefore.cacheKey);
    if (pinnedRevision !== null && pinnedRevision !== currentRevision) {
      return noStore({ error: "Dataversionen er ikke længere aktuel.", currentRevision }, 409);
    }
    const { markers, labels } = await getAppV2PublicNearbyTile(parsed.bounds);
    const revision = await getAppV2PublicDataRevision();
    if (revision.cacheKey !== revisionBefore.cacheKey) {
      return noStore({ error: "Datasættet blev opdateret. Prøv igen." }, 503);
    }
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
    return NextResponse.json(payload, {
      headers: { "Cache-Control": pinnedRevision === null ? sharedCacheControl : pinnedCacheControl },
    });
  } catch (error) {
    console.error("[nearby-tiles] Failed to load tile:", error instanceof Error ? error.name : "unknown");
    return noStore({ error: "Kortflisen kunne ikke hentes." }, 502);
  }
}
