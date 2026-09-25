import { expect, test, type Route } from "@playwright/test";

import {
  installNearbySearchContext,
  isolateRateLimit,
  mockAddressSearch,
  mockNearby,
  quietThirdPartyRequests,
} from "./support";

test.beforeEach(async ({ page }, testInfo) => {
  await isolateRateLimit(page, testInfo);
  await quietThirdPartyRequests(page);
});

test("afvist placering viser en konkret vej videre", { tag: "@full-stack" }, async ({ page }) => {
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

test("fejl i adressesøgningen efterlader GPS som tydeligt alternativ", async ({ page }) => {
  await page.route("https://adressevaelger.dk/husnumre/soeg**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });

  await page.goto("/");
  await page.getByRole("combobox", { name: "Adresse, by eller postnummer" }).fill("Testvej 1");

  await expect(page.getByRole("alert").filter({ hasText: "Adressesøgningen er ikke tilgængelig" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Brug min placering/ })).toBeEnabled();
});

test("forbigående fejl i adressesøgningen låser ikke adressesøgningen", async ({ page }) => {
  await page.route("https://adressevaelger.dk/husnumre/soeg**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });

  await page.goto("/");
  const combobox = page.getByRole("combobox", { name: "Adresse, by eller postnummer" });
  await combobox.fill("Rådhuspladsen");
  const alert = page.getByRole("alert").filter({ hasText: "Adressesøgningen er ikke tilgængelig" });
  await expect(alert).toBeVisible();
  await expect(combobox).toBeEnabled();

  await page.unroute("https://adressevaelger.dk/husnumre/soeg**");
  await mockAddressSearch(page);
  await alert.getByRole("button", { name: "Prøv igen" }).click();

  await expect(alert).toBeHidden();
  await expect(page.getByRole("option", { name: "Rådhuspladsen 1, 1550 København V" })).toBeVisible();
});

test("fejl ved opslag af adressens placering kan prøves igen", async ({ page }) => {
  await mockAddressSearch(page);
  await page.unroute("https://adressevaelger.dk/husnumre/0a3f507a-ec01-32b8-e044-0003ba298018?**");
  await page.route("https://adressevaelger.dk/husnumre/0a3f507a-ec01-32b8-e044-0003ba298018?**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });

  await page.goto("/");
  await page.getByRole("combobox", { name: "Adresse, by eller postnummer" }).fill("Rådhuspladsen 1");
  await page.getByRole("option", { name: "Rådhuspladsen 1, 1550 København V" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Adressesøgningen er ikke tilgængelig" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Søg", exact: true })).toBeDisabled();
});

test("GPS-timeout falder tilbage til netværksposition", async ({ page }) => {
  await mockNearby(page);
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          success: PositionCallback,
          failure?: PositionErrorCallback | null,
          options?: PositionOptions,
        ) => {
          if (options?.enableHighAccuracy) {
            failure?.({ code: 3, message: "Timeout", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
            return;
          }
          success({
            coords: { latitude: 55.6761, longitude: 12.5683, accuracy: 150 },
            timestamp: Date.now(),
          } as GeolocationPosition);
        },
      },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Brug min placering/ }).click();

  await expect(page).toHaveURL((url) => url.pathname === "/shelters/nearby");
});

test("tom adressesøgning forklarer næste skridt", async ({ page }) => {
  await mockAddressSearch(page, []);

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

test("en kortvarig 429 prøves automatisk igen én gang", async ({ page }) => {
  await installNearbySearchContext(page);
  // Registered first so the handler below (registered last, runs first) can fall back to it.
  await mockNearby(page);
  // Busy for the first 500 ms, so React's dev-mode double mount behaves like production.
  let calls = 0;
  let firstCallAt: number | null = null;
  await page.route("**/api/app-v2/nearby/grouped", async (route) => {
    calls += 1;
    firstCallAt ??= Date.now();
    if (Date.now() - firstCallAt < 500) {
      await route.fulfill({
        status: 429,
        headers: { "Retry-After": "1" },
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "rate_limited" } }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/shelters/nearby");

  await expect(page.getByText("Mange søger lige nu")).toBeVisible();
  await expect(page.locator("#nearby-list-panel").getByText("Rådhuspladsen 1", { exact: true })).toBeVisible();
  expect(calls).toBeGreaterThanOrEqual(2);
});

test("en lang Retry-After prøves ikke automatisk igen", async ({ page }) => {
  await installNearbySearchContext(page);
  let calls = 0;
  await page.route("**/api/app-v2/nearby/grouped", async (route) => {
    calls += 1;
    await route.fulfill({
      status: 429,
      headers: { "Retry-After": "60" },
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "rate_limited" } }),
    });
  });

  await page.goto("/shelters/nearby");

  await expect(page.getByRole("alert").filter({ hasText: "Vent et minut, og prøv igen" })).toBeVisible();
  await expect(page.getByText("Mange søger lige nu")).toHaveCount(0);
  const callsWhenShown = calls;
  await page.waitForTimeout(11_000);
  expect(calls).toBe(callsWhenShown);
});

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
