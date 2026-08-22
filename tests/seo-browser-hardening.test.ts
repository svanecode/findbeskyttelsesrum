import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { contentSecurityPolicyValue } from "../next.config.js";
import robots from "../src/app/robots";
import { getBreadcrumbJsonLd, serializeJsonLd } from "../src/lib/seo/json-ld";
import {
  buildCoreSitemapRoutes,
  buildMunicipalitySitemapRoutes,
  mostRecentSitemapDate,
  parseSitemapDate,
} from "../src/lib/seo/sitemap";

const sitemapPageUrl = new URL("../src/app/sitemap.ts", import.meta.url);
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
  const buildDate = "2026-08-18T10:00:00.000Z";
  const importDate = "2026-08-20T06:30:00.000Z";
  const latest = mostRecentSitemapDate(buildDate, importDate);
  const routes = buildCoreSitemapRoutes("https://findbeskyttelsesrum.dk", {
    dataDrivenLastModified: latest,
    staticLastModified: buildDate,
  });
  const municipalityRoutes = buildMunicipalitySitemapRoutes(
    "https://findbeskyttelsesrum.dk",
    ["aarhus", "kobenhavn"],
    latest,
  );

  assert.equal(latest?.toISOString(), importDate);
  assert.equal(routes[0].lastModified?.toString(), new Date(importDate).toString());
  assert.equal(routes.find((route) => route.url.endsWith("/privatliv"))?.lastModified?.toString(), new Date(buildDate).toString());
  assert.equal(routes.find((route) => route.url.endsWith("/kontakt"))?.lastModified?.toString(), new Date(buildDate).toString());
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
  assert.match(sitemapPage, /SITE_BUILD_TIMESTAMP/);
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
