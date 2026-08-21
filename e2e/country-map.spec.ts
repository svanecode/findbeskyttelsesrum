import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { isolateRateLimit, knownShelterSlug, quietThirdPartyRequests } from "./support";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Landskortets klyngeflow kontrolleres én gang.");
  await isolateRateLimit(page, testInfo);
  await quietThirdPartyRequests(page);
});

test("landskortet skifter fra serverklynge til konkret markør ved zoom", async ({ page }) => {
  const requests: URL[] = [];

  await page.route("**/api/country-shelters?**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const zoom = Number(url.searchParams.get("zoom"));
    const viewport = {
      north: Number(url.searchParams.get("north")),
      south: Number(url.searchParams.get("south")),
      east: Number(url.searchParams.get("east")),
      west: Number(url.searchParams.get("west")),
      zoom,
    };
    const features = zoom >= 10
      ? [{
          kind: "marker",
          slug: knownShelterSlug,
          name: "Rådhuspladsen 1",
          addressLine1: "Rådhuspladsen 1",
          postalCode: "1550",
          city: "København V",
          capacity: 120,
          sourceApplicationCode: "320",
          latitude: 55.6761,
          longitude: 12.5683,
        }]
      : [{
          kind: "cluster",
          id: `${zoom}:test`,
          latitude: 55.6761,
          longitude: 12.5683,
          north: 55.78,
          south: 55.58,
          east: 12.72,
          west: 12.42,
          count: 12,
          capacity: 1440,
        }];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contract: "country-map-features-v1",
        features,
        generatedAt: "2026-08-21T00:00:00.000Z",
        mode: zoom >= 10 ? "markers" : "clusters",
        availableCount: zoom >= 10 ? 1 : 12,
        featureCount: 1,
        markerCount: zoom >= 10 ? 1 : 0,
        clusterCount: zoom >= 10 ? 0 : 1,
        clusteredRegistrationCount: zoom >= 10 ? 0 : 12,
        truncated: false,
        viewport,
      }),
    });
  });

  await page.goto("/kort");

  const cluster = page.locator(".marker-cluster").filter({ hasText: "12" });
  await expect(cluster).toBeVisible();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations.map((violation) => violation.id)).toEqual([]);
  await cluster.click();
  await expect(page.locator(".shelter-marker")).toBeVisible();

  expect(requests.length).toBeGreaterThanOrEqual(2);
  expect(requests.every((url) => url.searchParams.get("format") === "features")).toBe(true);
  expect(requests.some((url) => Number(url.searchParams.get("zoom")) >= 10)).toBe(true);
});

test("landskortet beholder seneste data hvis en områdeopdatering fejler", async ({ page }) => {
  let requestCount = 0;

  await page.route("**/api/country-shelters?**", async (route) => {
    requestCount += 1;
    if (requestCount > 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      return;
    }

    const url = new URL(route.request().url());
    const zoom = Number(url.searchParams.get("zoom"));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contract: "country-map-features-v1",
        features: [{
          kind: "cluster",
          id: `${zoom}:test`,
          latitude: 55.6761,
          longitude: 12.5683,
          north: 55.78,
          south: 55.58,
          east: 12.72,
          west: 12.42,
          count: 12,
          capacity: 1440,
        }],
        generatedAt: "2026-08-21T00:00:00.000Z",
        mode: "clusters",
        availableCount: 12,
        featureCount: 1,
        markerCount: 0,
        clusterCount: 1,
        clusteredRegistrationCount: 12,
        truncated: false,
        viewport: {
          north: Number(url.searchParams.get("north")),
          south: Number(url.searchParams.get("south")),
          east: Number(url.searchParams.get("east")),
          west: Number(url.searchParams.get("west")),
          zoom,
        },
      }),
    });
  });

  await page.goto("/kort");
  const cluster = page.locator(".marker-cluster").filter({ hasText: "12" });
  await expect(cluster).toBeVisible();
  await cluster.click();

  await expect(
    page.getByRole("alert").filter({ hasText: "De senest hentede kortdata vises stadig" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Prøv igen" })).toBeVisible();
  await expect(cluster).toBeVisible();
});
