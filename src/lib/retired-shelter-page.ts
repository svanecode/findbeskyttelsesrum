import type { RetiredShelter } from "@/lib/supabase/app-v2-queries";

/**
 * The 410 page for a registration no longer in BBR. Self-contained HTML: it is
 * returned by a route handler, because a page cannot answer 410.
 */
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

export function retiredShelterHtml(shelter: RetiredShelter | null) {
  const address = shelter ? `${shelter.addressLine1}, ${shelter.postalCode} ${shelter.city}` : null;
  const searchHref = shelter && shelter.latitude !== null && shelter.longitude !== null
    ? `/naer-dig?${new URLSearchParams({ lat: String(shelter.latitude), lng: String(shelter.longitude), q: address! }).toString()}`
    : "/";
  const searchLabel = address ? `Find registreringer nær ${address}` : "Søg efter registreringer nær en adresse";

  return `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Registreringen findes ikke længere i BBR | Find Beskyttelsesrum</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0b0c0e; color: #f3f4f6; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 40rem; padding: 2rem 1rem; margin: 0 auto; }
  h1 { font-size: 1.75rem; line-height: 1.15; margin: 0 0 0.75rem; }
  p { margin: 0 0 1rem; color: #d1d5db; }
  a.primary { display: inline-flex; min-height: 44px; align-items: center; padding: 0.75rem 1rem; border-radius: 0.5rem; background: #f97316; color: #0b0c0e; font-weight: 600; text-decoration: none; }
  a { color: #f3f4f6; }
  .home { display: inline-block; margin-top: 1.25rem; }
</style>
</head>
<body>
<main>
  <h1>Registreringen findes ikke længere i BBR</h1>
  ${address ? `<p>Den sidst kendte adresse var ${escapeHtml(address)}.</p>` : ""}
  <p>Ved varsling: Gå indenfor, og følg myndighedernes information.</p>
  <a class="primary" href="${escapeHtml(searchHref)}">${escapeHtml(searchLabel)}</a>
  <p><a class="home" href="/">Til forsiden</a></p>
</main>
</body>
</html>`;
}
