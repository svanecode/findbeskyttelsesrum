import { expect, test, type Page } from "@playwright/test";

import {
  installNearbySearchContext,
  isolateRateLimit,
  mockNearby,
  nearbyResponse,
  quietThirdPartyRequests,
} from "./support";

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      })),
    )
    .toEqual({ viewportWidth: 640, documentWidth: 640 });
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Reflow kontrolleres én gang i desktopmotoren.");
  await page.setViewportSize({ width: 640, height: 720 });
  await isolateRateLimit(page, testInfo);
  await quietThirdPartyRequests(page);
});

test("centrale sider kan bruges ved 200 procent zoom uden vandret rulning", async ({ page }) => {
  const routes = [
    { path: "/", heading: "Se registrerede beskyttelsesrum nær dig" },
    { path: "/kommune", heading: "Kommuneoversigt" },
    { path: "/om-data", heading: "Datagrundlag" },
    { path: "/privatliv", heading: "Privatliv" },
  ];

  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("lange adresser bryder sikkert i resultater og det mobile kortpanel", async ({ page }) => {
  const longAddress =
    "Den Ekstraordinært Lange Vejbetegnelse Ved Det Gamle Vandværk 123, 4. sal, 9999 Eksempelby";
  const longResponse = {
    ...nearbyResponse,
    results: nearbyResponse.results.map((result) => ({
      ...result,
      address: {
        ...result.address,
        line1: "Den Ekstraordinært Lange Vejbetegnelse Ved Det Gamle Vandværk 123, 4. sal",
        postalCode: "9999",
        city: "Eksempelby",
      },
      representativeShelter: {
        ...result.representativeShelter,
        name: longAddress,
      },
      shelters: result.shelters.map((shelter) => ({ ...shelter, name: longAddress })),
    })),
  };

  await installNearbySearchContext(page, { label: longAddress });
  await mockNearby(page, 200, longResponse);
  await page.goto("/shelters/nearby");

  await expect(page.getByText(longResponse.results[0].address.line1, { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Vis på kort" }).click();
  await expect(page.getByLabel("Valgt registrering")).toContainText("Den Ekstraordinært Lange Vejbetegnelse");
  await expectNoHorizontalOverflow(page);
});
