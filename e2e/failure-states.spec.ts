import { expect, test, type Route } from "@playwright/test";

import {
  installNearbySearchContext,
  isolateRateLimit,
  mockDawa,
  mockNearby,
  quietThirdPartyRequests,
} from "./support";

test.beforeEach(async ({ page }, testInfo) => {
  await isolateRateLimit(page, testInfo);
  await quietThirdPartyRequests(page);
});

test("afvist placering viser en konkret vej videre", async ({ page }) => {
  const errorReports: unknown[] = [];
  const metricEvents: unknown[] = [];
  await page.route("**/api/errors", async (route) => {
    errorReports.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/metrics", async (route) => {
    metricEvents.push(route.request().postDataJSON());
    await route.fulfill({ status: 202 });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          failure?: PositionErrorCallback | null,
        ) => failure?.({ code: 1, message: "Permission denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }),
      },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Brug min placering/ }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Du har afvist adgang til din placering" })).toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.search === "");
  await expect.poll(() => metricEvents).toContainEqual({ eventName: "geolocation_denied" });
  await page.waitForTimeout(100);
  expect(errorReports).toHaveLength(0);
});

test("DAWA-fejl efterlader GPS som tydeligt alternativ", async ({ page }) => {
  await page.route("https://api.dataforsyningen.dk/autocomplete**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });

  await page.goto("/");
  await page.getByRole("combobox", { name: "Adresse, by eller postnummer" }).fill("Testvej 1");

  await expect(page.getByRole("alert").filter({ hasText: "Adressesøgningen er ikke tilgængelig" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Brug min placering/ })).toBeEnabled();
});

test("tom DAWA-søgning forklarer næste skridt", async ({ page }) => {
  await mockDawa(page, []);

  await page.goto("/");
  await page.getByRole("combobox", { name: "Adresse, by eller postnummer" }).fill("Findesikkevej");

  await expect(page.getByRole("status")).toContainText("Ingen adresser fundet");
  await expect(page.getByRole("button", { name: "Søg", exact: true })).toBeDisabled();
});

for (const status of [429, 502, 504]) {
  test(`nearby-fejl ${status} giver genindlæsning og alternative veje`, async ({ page }) => {
    await installNearbySearchContext(page);
    await mockNearby(page, status, { error: { code: `test_${status}` } });

    await page.goto("/shelters/nearby");

    await expect(
      page.getByRole("alert").filter({ hasText: "Vi kunne ikke hente BBR-registreringerne lige nu" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Genindlæs siden" })).toBeVisible();
    await expect(
      page.locator("#nearby-list-panel").getByRole("link", { name: "Kommuneoversigt" }),
    ).toBeVisible();
  });
}

test("kortfejl bevarer resultatlisten som fallback", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "Kortfallback kontrolleres i mobilprojekterne.");
  await installNearbySearchContext(page);
  await mockNearby(page);
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    await route.fulfill({ status: 503, contentType: "text/plain", body: "tile unavailable" });
  });

  await page.goto("/shelters/nearby");
  await page.getByRole("button", { name: "Vis på kort" }).click();

  const mapError = page.getByRole("alert").filter({ hasText: "Kortbaggrunden er ikke tilgængelig" });
  await expect(mapError).toBeVisible();
  await expect(mapError.getByRole("button", { name: "Prøv kortet igen" })).toBeFocused();
  await expect(page.locator("[data-map-content]")).toHaveAttribute("inert", "");
  await expect(page.locator("[data-map-content]")).toHaveAttribute("aria-hidden", "true");
  await mapError.getByRole("button", { name: "Til resultatlisten" }).click();
  await expect(page.getByRole("tab", { name: "Liste" })).toBeFocused();
  await expect(page.locator("#nearby-list-panel").getByText("Rådhuspladsen 1", { exact: true })).toBeVisible();
});

test("kortfejl gendanner fokus til den brugte kortkontrol efter retry", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Fokusretur kontrolleres i én mobilmotor.");
  await installNearbySearchContext(page);
  await mockNearby(page);

  const heldTiles: Route[] = [];
  let tileMode: "hold" | "fail" | "ready" = "hold";
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    if (tileMode === "hold") {
      heldTiles.push(route);
      return;
    }
    if (tileMode === "fail") {
      await route.fulfill({ status: 503, contentType: "text/plain", body: "tile unavailable" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  });

  await page.goto("/shelters/nearby");
  await page.getByRole("button", { name: "Vis på kort" }).click();
  const zoomIn = page.locator(".nearby-map .leaflet-control-zoom-in");
  await expect(zoomIn).toBeVisible();
  await zoomIn.focus();
  await expect(zoomIn).toBeFocused();

  tileMode = "fail";
  await Promise.all(
    heldTiles.splice(0).map((route) =>
      route.fulfill({ status: 503, contentType: "text/plain", body: "tile unavailable" }),
    ),
  );

  const mapError = page.getByRole("alert").filter({ hasText: "Kortbaggrunden er ikke tilgængelig" });
  const retry = mapError.getByRole("button", { name: "Prøv kortet igen" });
  await expect(retry).toBeFocused();
  tileMode = "ready";
  await retry.click();

  await expect(page.locator("[data-map-content]")).not.toHaveAttribute("inert", "");
  await expect(zoomIn).toBeFocused();
  expect(consoleErrors.filter((message) => /blocked aria-hidden|inert descendant/i.test(message))).toEqual([]);
});
