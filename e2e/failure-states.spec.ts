import { expect, test } from "@playwright/test";

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
  test.skip(testInfo.project.name !== "mobile-chromium", "Kortfallback kontrolleres i mobilprojektet.");
  await installNearbySearchContext(page);
  await mockNearby(page);
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    await route.fulfill({ status: 503, contentType: "text/plain", body: "tile unavailable" });
  });

  await page.goto("/shelters/nearby");
  await page.getByRole("button", { name: "Vis på kort" }).click();

  const mapError = page.getByRole("alert").filter({ hasText: "Kortbaggrunden er ikke tilgængelig" });
  await expect(mapError).toBeVisible();
  await mapError.getByRole("button", { name: "Til listen" }).click();
  await expect(page.locator("#nearby-list-panel").getByText("Rådhuspladsen 1", { exact: true })).toBeVisible();
});
