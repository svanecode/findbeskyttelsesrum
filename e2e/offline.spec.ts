import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * The offline copy is the visitor's own action ("Gem til brug uden net") and
 * works whatever they chose for statistics. These tests run against a
 * production build and real public data.
 */
test.use({
  serviceWorkers: "allow",
  // "Kun nødvendige": no statistics consent.
  storageState: { cookies: [], origins: [] },
});

/**
 * A real outage. context.setOffline alone does not reach the service worker's
 * own fetches in Chromium, so every request is also aborted at context level,
 * which does cover worker-initiated requests.
 */
async function simulateOutage(context: BrowserContext) {
  await context.route("**/*", (route) => route.abort("internetdisconnected"));
  await context.setOffline(true);
}

const searchContext = {
  version: 1,
  latitude: 55.6761,
  longitude: 12.5683,
  label: "Rådhuspladsen 1, 1550 København V",
};

async function declineStatisticsAndSearch(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("findbeskyttelsesrum.consent.v1", JSON.stringify({ version: 1, statistics: false, decidedAt: "2026-10-01T00:00:00.000Z" }));
  });
  await page.goto("/");
  await page.evaluate((value) => {
    window.sessionStorage.setItem("findbeskyttelsesrum.nearby-search.v1", JSON.stringify({ ...value, createdAt: Date.now() }));
  }, searchContext);
  await page.goto("/naer-dig");
  await expect(page.locator("#nearby-list-panel ol > li").first()).toBeVisible();
}

test("uden statistiksamtykke kan siden gemmes og bruges uden net", { tag: "@full-stack" }, async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Offlineflowet kontrolleres i én motor.");
  await declineStatisticsAndSearch(page);

  await page.getByRole("button", { name: "Gem til brug uden net" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Siden virker nu også uden net." })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^Gemt \d+\. \w+\.? \d{4}/)).toBeVisible();

  await simulateOutage(context);

  // The front page opens offline.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find beskyttelsesrum nær dig" })).toBeVisible();

  // The saved search opens offline, even in a tab without the search.
  await page.evaluate(() => window.sessionStorage.clear());
  await page.goto("/naer-dig");
  await expect(page.locator("#nearby-list-panel ol > li").first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Viser gemte data" })).toBeVisible();
});

test("uden gemt kopi registreres ingen offline-worker", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Offlineflowet kontrolleres i én motor.");
  await page.goto("/");
  // Longer than the idle delay before the worker would register.
  await page.waitForTimeout(4500);
  const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  expect(registrations).toBe(0);
});

test("uden gemte data for området forklarer siden, at man er offline", { tag: "@full-stack" }, async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Offlineflowet kontrolleres i én motor.");
  await declineStatisticsAndSearch(page);
  await page.getByRole("button", { name: "Gem til brug uden net" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Siden virker nu også uden net." })).toBeVisible({ timeout: 30_000 });

  await simulateOutage(context);
  // Search a different area whose tiles were never saved.
  await page.evaluate(() => {
    window.sessionStorage.setItem(
      "findbeskyttelsesrum.nearby-search.v1",
      JSON.stringify({ version: 1, latitude: 57.0488, longitude: 9.9217, label: "Aalborg", createdAt: Date.now() }),
    );
  });
  await page.reload();

  // "Du er offline" when the browser knows it, otherwise the connection message;
  // headless Chromium keeps navigator.onLine true here.
  await expect(page.getByRole("alert").filter({ hasText: "ingen gemte data for dette område" })).toBeVisible();
});
