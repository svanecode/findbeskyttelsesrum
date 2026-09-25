import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { isolateRateLimit, knownShelterSlug, quietThirdPartyRequests } from "./support";

test.beforeEach(async ({ page }, testInfo) => {
  await isolateRateLimit(page, testInfo);
  await quietThirdPartyRequests(page);
});

test("landskortet skifter fra serverklynge til konkret markør ved zoom", { tag: "@full-stack" }, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Landskortets klyngeflow kontrolleres én gang.");
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
        contract: "country-map-features-v2",
        datasetRevision: url.searchParams.get("revision"),
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
  const shelterMarker = page.locator(".shelter-marker");
  await expect(shelterMarker).toBeVisible();
  await shelterMarker.click();
  const popupClose = page.locator(".leaflet-popup-close-button");
  await expect(popupClose).toBeVisible();
  const popupCloseBox = await popupClose.boundingBox();
  expect(popupCloseBox?.width).toBeGreaterThanOrEqual(44);
  expect(popupCloseBox?.height).toBeGreaterThanOrEqual(44);

  expect(requests.length).toBeGreaterThanOrEqual(2);
  expect(requests.every((url) => url.searchParams.get("format") === "features")).toBe(true);
  expect(requests.some((url) => Number(url.searchParams.get("zoom")) >= 10)).toBe(true);
});

test("landskortet beholder seneste data hvis en områdeopdatering fejler", { tag: "@full-stack" }, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Landskortets fejlfallback kontrolleres én gang.");
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
        contract: "country-map-features-v2",
        datasetRevision: url.searchParams.get("revision"),
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

test("mobile tætte klynger samles i ét stort touchmål uden markør-tabstop", { tag: "@full-stack" }, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobilstrategien kontrolleres i én browserprofil.");

  await page.route("**/api/country-shelters?**", async (route) => {
    const url = new URL(route.request().url());
    const zoom = Number(url.searchParams.get("zoom"));
    const features = [
      { id: "a", latitude: 56.2600, longitude: 9.5000, count: 12, capacity: 120 },
      { id: "b", latitude: 56.2608, longitude: 9.5010, count: 20, capacity: 200 },
      { id: "c", latitude: 56.2616, longitude: 9.5020, count: 28, capacity: 280 },
    ].map((cluster) => ({
      kind: "cluster",
      ...cluster,
      id: `${zoom}:${cluster.id}`,
      north: cluster.latitude + 0.03,
      south: cluster.latitude - 0.03,
      east: cluster.longitude + 0.03,
      west: cluster.longitude - 0.03,
    }));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contract: "country-map-features-v2",
        datasetRevision: url.searchParams.get("revision"),
        features,
        generatedAt: "2026-08-30T00:00:00.000Z",
        mode: "clusters",
        availableCount: 60,
        featureCount: 3,
        markerCount: 0,
        clusterCount: 3,
        clusteredRegistrationCount: 60,
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

  await expect(
    page.locator("#country-map-keyboard-help").getByRole("link", { name: "Kommuneoversigt" }),
  ).toBeVisible();
  const combinedCluster = page.locator(".marker-cluster").filter({ hasText: "60" });
  await expect(combinedCluster).toHaveCount(1);
  await expect(combinedCluster).toHaveAttribute("tabindex", "-1");
  await expect(combinedCluster).toHaveAttribute("aria-hidden", "true");

  const targetBox = await combinedCluster.boundingBox();
  expect(targetBox?.width).toBeGreaterThanOrEqual(44);
  expect(targetBox?.height).toBeGreaterThanOrEqual(44);

  const zoomControls = page.locator(".leaflet-control-zoom a");
  await expect(zoomControls).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    const controlBox = await zoomControls.nth(index).boundingBox();
    expect(controlBox?.width).toBeGreaterThanOrEqual(44);
    expect(controlBox?.height).toBeGreaterThanOrEqual(44);
  }

  const zoomedRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/country-shelters" && Number(url.searchParams.get("zoom")) > 7;
  });
  await combinedCluster.click();
  const zoomedUrl = new URL((await zoomedRequestPromise).url());
  expect(Number(zoomedUrl.searchParams.get("north"))).toBeGreaterThanOrEqual(56.2916);
  expect(Number(zoomedUrl.searchParams.get("south"))).toBeLessThanOrEqual(56.23);
  expect(Number(zoomedUrl.searchParams.get("east"))).toBeGreaterThanOrEqual(9.532);
  expect(Number(zoomedUrl.searchParams.get("west"))).toBeLessThanOrEqual(9.47);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("blandede serverklynger og singleton-markører deler ét kollisionsfrit lag", { tag: "@full-stack" }, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mixed-feature strategien kontrolleres i én mobilprofil.");

  await page.route("**/api/country-shelters?**", async (route) => {
    const url = new URL(route.request().url());
    const zoom = Number(url.searchParams.get("zoom"));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contract: "country-map-features-v2",
        datasetRevision: url.searchParams.get("revision"),
        features: [
          {
            kind: "cluster",
            id: `${zoom}:cluster`,
            latitude: 56.26,
            longitude: 9.5,
            north: 56.29,
            south: 56.23,
            east: 9.53,
            west: 9.47,
            count: 12,
            capacity: 120,
          },
          {
            kind: "marker",
            slug: knownShelterSlug,
            name: "Testvej 1",
            addressLine1: "Testvej 1",
            postalCode: "8000",
            city: "Aarhus C",
            capacity: 80,
            sourceApplicationCode: "320",
            latitude: 56.31,
            longitude: 9.55,
          },
        ],
        generatedAt: "2026-08-30T00:00:00.000Z",
        mode: "clusters",
        availableCount: 13,
        featureCount: 2,
        markerCount: 1,
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
  const combinedCluster = page.locator(".marker-cluster").filter({ hasText: "13" });
  await expect(combinedCluster).toHaveCount(1);
  await expect(page.locator(".shelter-marker")).toHaveCount(0);

  const zoomedRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/country-shelters" && Number(url.searchParams.get("zoom")) > 7;
  });
  await combinedCluster.click();
  const zoomedUrl = new URL((await zoomedRequestPromise).url());
  expect(Number(zoomedUrl.searchParams.get("north"))).toBeGreaterThanOrEqual(56.31);
  expect(Number(zoomedUrl.searchParams.get("east"))).toBeGreaterThanOrEqual(9.55);
  expect(Number(zoomedUrl.searchParams.get("south"))).toBeLessThanOrEqual(56.23);
  expect(Number(zoomedUrl.searchParams.get("west"))).toBeLessThanOrEqual(9.47);
});
