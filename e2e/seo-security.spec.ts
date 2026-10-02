import { expect, test } from "@playwright/test";

import { knownShelterSlug, quietThirdPartyRequests } from "./support";

test("robots and sitemap expose stable crawlable metadata", { tag: "@full-stack" }, async ({ request }) => {
  const robotsResponse = await request.get("/robots.txt");
  expect(robotsResponse.ok()).toBe(true);
  const robots = await robotsResponse.text();
  expect(robots).toContain("Disallow: /admin/");
  expect(robots).not.toContain("Disallow: /_next/");

  const firstSitemapResponse = await request.get("/sitemap.xml");
  const secondSitemapResponse = await request.get("/sitemap.xml");
  expect(firstSitemapResponse.ok()).toBe(true);
  expect(secondSitemapResponse.ok()).toBe(true);

  const firstSitemap = await firstSitemapResponse.text();
  const secondSitemap = await secondSitemapResponse.text();
  expect(secondSitemap).toBe(firstSitemap);
  expect(firstSitemap).toContain("/kommune/kobenhavn");
  expect(firstSitemap).toContain("/beskyttelsesrum/");

  const lastModifiedValues = [...firstSitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(
    (match) => match[1],
  );
  expect(lastModifiedValues.length).toBeGreaterThan(0);
  expect(lastModifiedValues.every((value) => Number.isFinite(Date.parse(value)))).toBe(true);
});

test("production responses carry the hardened CSP and no service worker", { tag: "@full-stack" }, async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const csp = response.headers()["content-security-policy"] ?? "";

  expect(csp).toContain("script-src-attr 'none'");
  expect(csp).toContain("media-src 'none'");
  expect(csp).not.toContain("https://*.vercel.app");
  expect(csp).not.toMatch(/(?:^|\s)wss?:/);

  const serviceWorkerResponse = await request.get("/sw.js");
  expect(serviceWorkerResponse.status()).toBe(404);
});

test("a shelter detail page exposes visible and machine-readable breadcrumbs", { tag: "@full-stack" }, async ({ page }) => {
  await quietThirdPartyRequests(page);
  await page.goto(`/beskyttelsesrum/${knownShelterSlug}`);

  const breadcrumbs = page.getByRole("navigation", { name: "Brødkrummer" });
  await expect(breadcrumbs.getByRole("link", { name: "Forside" })).toBeVisible();
  await expect(breadcrumbs.getByRole("link", { name: "København" })).toBeVisible();

  const structuredData = await page.locator('script[type="application/ld+json"]').allTextContents();
  const jsonLd = structuredData.map((value) => JSON.parse(value) as Record<string, unknown>);
  const breadcrumbJsonLd = jsonLd.find((value) => value["@type"] === "BreadcrumbList");

  expect(breadcrumbJsonLd).toBeTruthy();
  expect(breadcrumbJsonLd?.itemListElement).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ position: 1, name: "Forside" }),
      expect.objectContaining({ position: 2, name: "København" }),
    ]),
  );
});

test("public pages expose route-specific canonical and sharing metadata", async ({ page }) => {
  await quietThirdPartyRequests(page);

  for (const path of ["/", "/kort", "/kommune", "/om-data", "/privatliv", "/kontakt"]) {
    await page.goto(path);
    const expectedUrl = new URL(path, "https://findbeskyttelsesrum.dk").toString();
    const expectedCanonical = path === "/" ? "https://findbeskyttelsesrum.dk" : expectedUrl;

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", expectedCanonical);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", expectedCanonical);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      "https://findbeskyttelsesrum.dk/opengraph-image",
    );
    await expect(page.locator('meta[name="twitter:title"]')).toHaveCount(1);
  }

  const missingResponse = await page.goto("/seo-test-side-som-ikke-findes");
  expect(missingResponse?.status()).toBe(404);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test("all municipalities and address pages are linked in server-rendered pagination", { tag: "@full-stack" }, async ({ page }, testInfo) => {
  await quietThirdPartyRequests(page);
  await page.goto("/kommune");

  const municipalityLinks = page
    .getByRole("region", { name: "Kommuner" })
    .locator('a[href^="/kommune/"]');
  await expect(municipalityLinks).toHaveCount(98);
  await expect(page.getByRole("button", { name: "Vis flere kommuner" })).toHaveCount(0);

  await page.goto("/kommune/kobenhavn");
  const pagination = page.getByRole("navigation", { name: "Sider med adresser i kommunen" });
  const pageTwoLink = pagination.getByRole("link", { name: "Side 2", exact: true });
  await expect(pageTwoLink).toHaveAttribute(
    "href",
    "/kommune/kobenhavn/side/2",
  );
  await expect(page.locator('li[id^="kommune-group-"]')).toHaveCount(30);

  // Validate the exact document a crawler receives. Firefox can retain the
  // previous streamed head briefly during a client transition, which does not
  // represent the destination page's server-rendered metadata.
  await page.goto("/kommune/kobenhavn/side/2");
  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveCount(1);
  await expect(canonical).toHaveAttribute(
    "href",
    "https://findbeskyttelsesrum.dk/kommune/kobenhavn/side/2",
  );
  await expect(page.getByText("Side 2 af", { exact: false })).toBeVisible();

  if (testInfo.project.name === "desktop-chromium") {
    const duplicateFirstPage = await page.request.get("/kommune/kobenhavn/side/1", {
      maxRedirects: 0,
    });
    expect(duplicateFirstPage.status()).toBe(308);
    const redirectDestinations = duplicateFirstPage
      .headersArray()
      .filter((header) => header.name.toLowerCase() === "location")
      .map((header) => header.value);
    expect(redirectDestinations.length).toBeGreaterThan(0);
    expect(redirectDestinations.every((destination) => destination === "/kommune/kobenhavn")).toBe(true);
  }
});

test("kommunesøgningen dækker hele kommunen og kan deles som link", { tag: "@full-stack" }, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Den databasebaserede kommunesøgning køres én gang.");
  await quietThirdPartyRequests(page);

  // An address that is only on a late page without a search.
  await page.goto("/kommune/aarhus/side/14");
  const lateAddress = (await page.locator('li[id^="kommune-group-"] a').first().textContent())!.trim();

  await page.goto("/kommune/aarhus");
  await page.getByRole("searchbox", { name: "Søg i alle adresser i Aarhus" }).fill(lateAddress);
  await page.getByRole("button", { name: "Søg", exact: true }).click();

  await expect(page).toHaveURL((url) => url.pathname === "/kommune/aarhus" && url.searchParams.get("q") === lateAddress);
  const results = page.locator('li[id^="kommune-group-"]');
  await expect(results.getByRole("link", { name: lateAddress, exact: true })).toBeVisible();
  await page.reload();
  await expect(results.getByRole("link", { name: lateAddress, exact: true })).toBeVisible();
  await expect(page.getByText("Søgningen og kortet omfatter adresserne på denne side")).toHaveCount(0);

  await page.goto("/kommune/aarhus?q=xyzzy");
  await expect(page.getByText("Ingen registreringer i Aarhus matcher 'xyzzy'")).toBeVisible();
  await expect(page.getByRole("link", { name: "forsiden" })).toHaveAttribute("href", "/");
});

test("gamle adresser svarer med permanent redirect til de nye", { tag: "@full-stack" }, async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Redirects kontrolleres én gang.");
  const nearby = await request.get("/shelters/nearby", { maxRedirects: 0 });
  expect(nearby.status()).toBe(308);
  expect(nearby.headers().location).toBe("/naer-dig");

  const detail = await request.get(`/beskyttelsesrum/${knownShelterSlug}`, { maxRedirects: 0 });
  expect(detail.status()).toBe(308);
  const readable = detail.headers().location!;
  expect(readable).toMatch(/^\/beskyttelsesrum\/[a-z0-9-]+-\d{4}-[a-z0-9-]+$/);
  expect((await request.get(readable, { maxRedirects: 0 })).status()).toBe(200);
});
