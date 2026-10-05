import { retiredShelterHtml } from "@/lib/retired-shelter-page";
import { resolveRetiredShelter } from "@/lib/supabase/app-v2-queries";

/**
 * 410 for a registration that is no longer in BBR. src/proxy.ts rewrites the
 * detail path here, so a shared link keeps its address and answers 410 with
 * a way to search near the last known address.
 */

type Context = { params: Promise<{ slug: string }> };

/**
 * A page cannot answer 410, so the page with the site's header, footer and
 * fonts (src/app/intern/fjernet/[slug]) is fetched and its HTML returned with
 * status 410. Null when it cannot be fetched, for example behind preview
 * protection; the plain page is used then.
 */
async function renderWithSiteLayout(request: Request, slug: string) {
  try {
    const response = await fetch(new URL(`/intern/fjernet/${encodeURIComponent(slug)}`, request.url), {
      headers: { Accept: "text/html" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) return null;
    return await response.text();
  } catch {
    return null;
  }
}

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
  return new Response(await renderWithSiteLayout(request, slug) ?? retiredShelterHtml(shelter), {
    status: 410,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex",
    },
  });
}
