import { expect, test } from "@playwright/test";

/**
 * The offline worker only registers in production builds, so this runs in CI
 * (playwright.config.ts) against real public data.
 */
test.use({ serviceWorkers: "allow" });

// Runs before every page load; keeps a context the test changed later.
function setSearchContextOnce(value: Record<string, unknown>) {
  const key = "findbeskyttelsesrum.nearby-search.v1";
  if (!window.sessionStorage.getItem(key)) {
    window.sessionStorage.setItem(key, JSON.stringify({ ...value, createdAt: Date.now() }));
  }
}

const searchContext = {
  version: 1,
  latitude: 55.6761,
  longitude: 12.5683,
  label: "Rådhuspladsen 1, 1550 København V",
};

test("gemte kortfliser viser resultater uden net med tydelig markering", { tag: "@full-stack" }, async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Offlineflowet kontrolleres i én motor.");
  await context.addInitScript(setSearchContextOnce, searchContext);

  // First visit online: the worker installs and caches the page, its assets and the tiles.
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.goto("/shelters/nearby");
  await expect(page.locator("#nearby-list-panel article").first()).toBeVisible();
  await expect(page.getByText("Viser gemte data")).toHaveCount(0);

  await context.setOffline(true);
  await page.reload();

  await expect(page.locator("#nearby-list-panel article").first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Viser gemte data" })).toBeVisible();
  await context.setOffline(false);
});

test("uden gemte data forklarer siden, at man er offline", { tag: "@full-stack" }, async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Offlineflowet kontrolleres i én motor.");
  await context.addInitScript(setSearchContextOnce, searchContext);

  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.goto("/shelters/nearby");
  await expect(page.locator("#nearby-list-panel article").first()).toBeVisible();

  await context.setOffline(true);
  // Search a different area whose tiles were never cached.
  await page.evaluate(() => {
    window.sessionStorage.setItem(
      "findbeskyttelsesrum.nearby-search.v1",
      JSON.stringify({ version: 1, latitude: 57.0488, longitude: 9.9217, label: "Aalborg", createdAt: Date.now() }),
    );
  });
  await page.reload();

  await expect(page.getByRole("alert").filter({ hasText: "Du er offline" })).toBeVisible();
  await context.setOffline(false);
});
