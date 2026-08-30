import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { contentSecurityPolicyValue } from "../next.config.js";
import robots from "../src/app/robots";
import {
  getMunicipalityPagePath,
  paginateMunicipalityGroups,
  parseMunicipalityPage,
} from "../src/lib/municipalities/pagination";
import { getBreadcrumbJsonLd, serializeJsonLd } from "../src/lib/seo/json-ld";
import { createPageMetadata } from "../src/lib/seo/metadata";
import {
  buildCoreSitemapRoutes,
  buildMunicipalitySitemapRoutes,
  parseSitemapDate,
} from "../src/lib/seo/sitemap";

const sitemapPageUrl = new URL("../src/app/sitemap.ts", import.meta.url);
const rootLayoutUrl = new URL("../src/app/layout.tsx", import.meta.url);
const municipalityListUrl = new URL("../src/app/kommune/municipality-list.tsx", import.meta.url);
const serviceWorkerUrl = new URL("../public/sw.js", import.meta.url);

test("robots keeps framework assets crawlable while protecting private routes", () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
  const disallow = Array.isArray(rules.disallow) ? rules.disallow : [rules.disallow];

  assert.equal(rules.allow, "/");
  assert.ok(disallow.includes("/admin/"));
  assert.ok(disallow.includes("/auth/"));
  assert.ok(disallow.includes("/api/"));
  assert.ok(!disallow.includes("/_next/"));
});

test("sitemap dates are stable inputs instead of request-time timestamps", async () => {
  const importDate = "2026-08-20T06:30:00.000Z";
  const routes = buildCoreSitemapRoutes("https://findbeskyttelsesrum.dk", importDate);
  const municipalityRoutes = buildMunicipalitySitemapRoutes(
    "https://findbeskyttelsesrum.dk",
    ["aarhus", "kobenhavn"],
    importDate,
  );

  assert.equal(routes[0].lastModified?.toString(), new Date(importDate).toString());
  assert.equal(routes.find((route) => route.url.endsWith("/privatliv"))?.lastModified, undefined);
  assert.equal(routes.find((route) => route.url.endsWith("/kontakt"))?.lastModified, undefined);
  assert.deepEqual(
    municipalityRoutes.map((route) => route.url),
    [
      "https://findbeskyttelsesrum.dk/kommune/aarhus",
      "https://findbeskyttelsesrum.dk/kommune/kobenhavn",
    ],
  );
  assert.equal(parseSitemapDate("not-a-date"), undefined);

  const sitemapPage = await readFile(sitemapPageUrl, "utf8");
  assert.doesNotMatch(sitemapPage, /new Date\(\)/);
  assert.match(sitemapPage, /getAppV2PublicDataStats/);
  assert.doesNotMatch(sitemapPage, /SITE_BUILD_TIMESTAMP/);
  assert.doesNotMatch(sitemapPage, /catch\s*\(/);
  assert.doesNotMatch(sitemapPage, /return\s+\[\]/);
});

test("route metadata owns canonical and social fields instead of inheriting the homepage", async () => {
  const metadata = createPageMetadata({
    title: "Kontakt",
    description: "Privat kontaktportal.",
    path: "/kontakt",
  });

  assert.equal(metadata.alternates?.canonical, "/kontakt");
  assert.equal(metadata.openGraph?.url, "https://findbeskyttelsesrum.dk/kontakt");
  assert.equal(metadata.openGraph?.title, "Kontakt | Find Beskyttelsesrum");
  assert.equal(metadata.twitter?.title, "Kontakt | Find Beskyttelsesrum");
  assert.deepEqual(metadata.twitter?.images, ["https://findbeskyttelsesrum.dk/opengraph-image"]);

  const rootLayout = await readFile(rootLayoutUrl, "utf8");
  assert.doesNotMatch(rootLayout, /alternates:\s*\{\s*canonical:/);
  assert.doesNotMatch(rootLayout, /openGraph:\s*\{/);
  assert.doesNotMatch(rootLayout, /twitter:\s*\{/);
});

test("municipality pagination uses crawlable paths and bounded page payloads", async () => {
  const items = Array.from({ length: 65 }, (_, index) => index + 1);
  const page = paginateMunicipalityGroups(items, 2);

  assert.equal(parseMunicipalityPage(undefined), 1);
  assert.equal(parseMunicipalityPage("2"), 2);
  assert.equal(parseMunicipalityPage("0"), null);
  assert.equal(parseMunicipalityPage(["1", "2"]), null);
  assert.equal(getMunicipalityPagePath("kobenhavn", 1), "/kommune/kobenhavn");
  assert.equal(getMunicipalityPagePath("kobenhavn", 2), "/kommune/kobenhavn/side/2");
  assert.equal(page?.items.length, 30);
  assert.equal(page?.firstItemNumber, 31);
  assert.equal(page?.lastItemNumber, 60);
  assert.equal(page?.totalPages, 3);
  assert.equal(paginateMunicipalityGroups(items, 4), null);

  const municipalityList = await readFile(municipalityListUrl, "utf8");
  assert.match(municipalityList, /filtered\.map/);
  assert.doesNotMatch(municipalityList, /visibleCount|Vis flere kommuner/);
});

test("detail breadcrumbs are valid JSON-LD and escape markup safely", () => {
  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Forside", url: "https://findbeskyttelsesrum.dk" },
    { name: "København", url: "https://findbeskyttelsesrum.dk/kommune/kobenhavn" },
    {
      name: "Registrering </script>",
      url: "https://findbeskyttelsesrum.dk/beskyttelsesrum/test",
    },
  ]);

  assert.equal(breadcrumb["@type"], "BreadcrumbList");
  assert.deepEqual(
    breadcrumb.itemListElement.map((item) => item.position),
    [1, 2, 3],
  );
  assert.doesNotMatch(serializeJsonLd(breadcrumb), /<\/script>/);
});

test("production CSP narrows scripts and browser capabilities without breaking required services", () => {
  const production = contentSecurityPolicyValue({
    environment: "production",
    supabaseOrigin: "https://example.supabase.co",
  });
  const development = contentSecurityPolicyValue({
    environment: "development",
    supabaseOrigin: "https://example.supabase.co",
  });
  const localHttpTest = contentSecurityPolicyValue({
    environment: "production",
    supabaseOrigin: "https://example.supabase.co",
    upgradeInsecureRequests: false,
  });

  assert.match(production, /script-src-attr 'none'/);
  assert.match(production, /media-src 'none'/);
  assert.match(production, /frame-src https:\/\/www\.openstreetmap\.org/);
  assert.match(production, /connect-src 'self' https:\/\/example\.supabase\.co/);
  assert.doesNotMatch(production, /https:\/\/\*\.vercel\.app/);
  assert.doesNotMatch(production, /(?:^|\s)wss?:/);
  assert.doesNotMatch(production, /connect-src[^;]*tile\.openstreetmap\.org/);
  assert.match(production, /upgrade-insecure-requests/);
  assert.doesNotMatch(localHttpTest, /upgrade-insecure-requests|block-all-mixed-content/);
  assert.match(development, /'unsafe-eval'/);
  assert.match(development, /(?:^|\s)ws:/);
  assert.match(development, /(?:^|\s)wss:/);
});

test("the expired service-worker cleanup endpoint is gone", () => {
  assert.equal(existsSync(serviceWorkerUrl), false);
});
