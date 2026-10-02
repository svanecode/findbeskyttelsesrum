import { unstable_cache } from "next/cache";

import { getAppV2PublicPostalAreaTable } from "@/lib/supabase/queries/postal-areas";

/**
 * All Danish postcodes for the address search. Public, identical for every
 * visitor and refreshed by the daily import, so the CDN serves it.
 */

export const runtime = "nodejs";

const readPostalAreas = unstable_cache(getAppV2PublicPostalAreaTable, ["app-v2-postal-areas-v1"], { revalidate: 3600 });

export async function GET() {
  const table = await readPostalAreas().catch(() => null);
  if (!table) {
    return Response.json({ error: { code: "postal_areas_unavailable" } }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return Response.json(table, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
