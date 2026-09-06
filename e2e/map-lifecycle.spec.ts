import { expect, test, type Page } from "@playwright/test";

import {
  installNearbySearchContext,
  isolateRateLimit,
  mockNearby,
  nearbyResponse,
  quietThirdPartyRequests,
} from "./support";

const tilePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function currentTileZoom(page: Page, mapSelector: string) {
  return page.locator(`${mapSelector} .leaflet-tile-container`).evaluateAll((levels) => {
    const current = levels.find((level) => (level as HTMLElement).style.transform.endsWith("scale(1)"));
    const tile = current?.querySelector<HTMLImageElement>("img.leaflet-tile-loaded");
    return tile ? Number(new URL(tile.src).pathname.split("/")[1]) : null;
  });
}

async function settleTiles(page: Page, mapSelector: string) {
  await expect(page.locator(`${mapSelector} .leaflet-tile-loaded`).first()).toBeAttached();
  await expect(page.locator(`${mapSelector} .leaflet-tile:not(.leaflet-tile-loaded)`)).toHaveCount(0);
  // Let React apply the tile layer's ready callback before checking the viewport.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test.beforeEach(async ({ page }, testInfo) => {
  await isolateRateLimit(page, testInfo);
  await quietThirdPartyRequests(page);
});

test("nærkortet bevarer brugerens zoom efter langsomme kortfliser og markørvalg", async ({ page }, testInfo) => {
  const centerResult = nearbyResponse.results[0]!;
  await installNearbySearchContext(page);
  await mockNearby(page, 200, {
    ...nearbyResponse,
    results: [
      centerResult,
      ...[
        { latitude: 55.71, longitude: 12.60 },
        { latitude: 55.64, longitude: 12.54 },
      ].map((coordinates, index) => ({
        ...centerResult,
        groupKey: `outer-result-${index}`,
        address: { ...centerResult.address, line1: `Yderadresse ${index + 1}` },
        coordinates,
      })),
    ],
  });

  await page.goto("/shelters/nearby");
  await expect(page.locator("#nearby-list-panel").getByText("Yderadresse 1", { exact: true })).toBeAttached();
  if (testInfo.project.name.startsWith("mobile-")) {
    await page.getByRole("tab", { name: "Kort", exact: true }).click();
  }

  const mapSelector = ".nearby-map";
  await expect.poll(() => currentTileZoom(page, mapSelector)).not.toBeNull();
  await settleTiles(page, mapSelector);
  const initialZoom = (await currentTileZoom(page, mapSelector))!;
  expect(initialZoom).toBeLessThan(16);

  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    // Finish after Leaflet's zoom animation, when the old bounds effect reset it.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ status: 200, contentType: "image/png", body: tilePng });
  });
  const zoomedTileRequest = page.waitForRequest((request) =>
    request.url().startsWith(`https://tile.openstreetmap.org/${initialZoom + 1}/`),
  );
  await page.locator(`${mapSelector} .leaflet-control-zoom-in`).click();
  await zoomedTileRequest;
  await settleTiles(page, mapSelector);
  expect(await currentTileZoom(page, mapSelector)).toBe(initialZoom + 1);

  await page.locator(`${mapSelector} .shelter-marker[title="Rådhuspladsen 1"]`).click();
  await settleTiles(page, mapSelector);
  expect(await currentTileZoom(page, mapSelector)).toBe(initialZoom + 1);
});

test("kommunekortet tilpasser første visning til sidens adresser", async ({ page }, testInfo) => {
  await page.goto("/kommune/kobenhavn");
  if (testInfo.project.name.startsWith("mobile-")) {
    await page.getByRole("link", { name: "Vis kort", exact: true }).click();
  }

  // Copenhagen's first page is compact; zoom 10 leaves most of the map unused.
  await expect.poll(() => currentTileZoom(page, "#municipality-map")).toBeGreaterThan(10);
});

test("første mobilvalg fokuserer adressen efter kommunekortets lazy loading", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "Lazy aktivering kontrolleres i mobilprojekterne.");
  await page.goto("/kommune/kobenhavn");
  const firstSelection = page.getByRole("button", { name: /^Vis .+ på kortet$/ }).first();
  await expect(firstSelection).toBeVisible();
  await expect(page.locator("#municipality-map .leaflet-container")).toHaveCount(0);

  await firstSelection.click();

  await expect.poll(() => currentTileZoom(page, "#municipality-map")).toBeGreaterThanOrEqual(14);
});
