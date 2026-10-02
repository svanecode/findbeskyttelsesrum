import { retiredShelterHtml } from "@/lib/retired-shelter-page";
import { resolveRetiredShelter } from "@/lib/supabase/app-v2-queries";

/**
 * 410 for a registration that is no longer in BBR. src/proxy.ts rewrites the
 * detail path here, so a shared link keeps its address and answers 410 with
 * a way to search near the last known address.
 */

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Context) {
  const { slug } = await context.params;
  let shelter: Awaited<ReturnType<typeof resolveRetiredShelter>> = null;
  let lookupFailed = false;
  try {
    shelter = await resolveRetiredShelter(slug);
  } catch {
    // Answer 410 without the address rather than risk a redirect loop with the proxy.
    lookupFailed = true;
  }
  // Reached directly for a registration that still exists: show its page.
  if (!shelter && !lookupFailed) {
    // The marker stops the proxy from sending it back here while its list is stale.
    return Response.redirect(new URL(`/beskyttelsesrum/${encodeURIComponent(slug)}?findes=1`, request.url), 307);
  }
  return new Response(retiredShelterHtml(shelter), {
    status: 410,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex",
    },
  });
}
