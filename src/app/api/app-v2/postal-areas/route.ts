import { unstable_cache } from "next/cache";

import { getAppV2PublicDataRevision } from "@/lib/supabase/app-v2-queries";
import { getAppV2PublicPostalAreaTable } from "@/lib/supabase/queries/postal-areas";

/**
 * All Danish postcodes for the address search. Public and identical for every
 * visitor, so the CDN serves it.
 *
 * The cached table is keyed by the public data revision, which changes with
 * every publication. Each import therefore gets a fresh table without a
 * manual cache key change or a revalidation call. The importer refreshes the
 * postcodes just after it publishes, so the entry also expires after ten
 * minutes; a table read in between is replaced shortly after.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const readPostalAreas = unstable_cache(
  async (revision: string) => {
    if (!revision) throw new Error("The postcode cache requires a public data revision.");
    return getAppV2PublicPostalAreaTable();
  },
  ["app-v2-postal-areas-v2"],
  { revalidate: 600 },
);

export async function GET() {
  const revision = await getAppV2PublicDataRevision().then((value) => value.cacheKey, () => "unavailable");
  const table = await readPostalAreas(revision).catch(() => null);
  if (!table) {
    return Response.json({ error: { code: "postal_areas_unavailable" } }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return Response.json(table, {
    headers: {
      // Short at the CDN, so a new import reaches visitors within minutes.
      "Cache-Control": "public, max-age=3600, s-maxage=300, stale-while-revalidate=3600",
      "X-Public-Data-Revision": revision,
    },
  });
}
