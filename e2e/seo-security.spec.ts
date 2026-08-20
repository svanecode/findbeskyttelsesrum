import { expect, test } from "@playwright/test";

import { knownShelterSlug, quietThirdPartyRequests } from "./support";

test("robots and sitemap expose stable crawlable metadata", async ({ request }) => {
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

test("production responses carry the hardened CSP and no service worker", async ({ request }) => {
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

test("a shelter detail page exposes visible and machine-readable breadcrumbs", async ({ page }) => {
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
