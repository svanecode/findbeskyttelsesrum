import { expect, test } from "@playwright/test";

import {
  installNearbySearchContext,
  isolateRateLimit,
  mockAddressSearch,
  mockNearby,
  quietThirdPartyRequests,
  selectedAddressLabel,
} from "./support";

test.beforeEach(async ({ page }, testInfo) => {
  await isolateRateLimit(page, testInfo);
  await quietThirdPartyRequests(page);
});

test("adresseflowet viser resultater uden steddata i URL'en", { tag: "@full-stack" }, async ({ page }) => {
  const metricPayloads: Array<Record<string, unknown>> = [];
  await page.route("**/api/metrics", async (route) => {
    metricPayloads.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 202 });
  });
  await mockAddressSearch(page);
  await mockNearby(page);

  await page.goto("/");
  const addressInput = page.getByRole("combobox", { name: "Adresse, by eller postnummer" });
  await addressInput.fill("Rådhuspladsen 1");
  await page.getByRole("option", { name: selectedAddressLabel }).click();
  await expect(page.getByText(`Valgt adresse: ${selectedAddressLabel}`)).toBeVisible();

  const nearbyRequestPromise = page.waitForRequest(
    (request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/app-v2/nearby/grouped",
  );
  await page.getByRole("button", { name: "Søg", exact: true }).click();

  await expect(page).toHaveURL((url) => url.pathname === "/shelters/nearby" && url.search === "");
  await expect(page.getByRole("heading", { name: "Registrerede sikringsrumspladser i nærheden" })).toBeVisible();
  await expect(page.getByText("Rådhuspladsen 1", { exact: true })).toBeVisible();
  await expect(page.getByText("120 BBR-registrerede pladser")).toBeVisible();

  const nearbyRequest = await nearbyRequestPromise;
  expect(new URL(nearbyRequest.url()).search).toBe("");
  const nearbyBody = nearbyRequest.postDataJSON() as { lat: number; lng: number; limit: number };
  expect(Object.keys(nearbyBody).sort()).toEqual(["lat", "limit", "lng"]);
  expect(nearbyBody.lat).toBeCloseTo(55.6761, 6);
  expect(nearbyBody.lng).toBeCloseTo(12.5683, 6);
  expect(nearbyBody.limit).toBe(10);
  await expect.poll(() => metricPayloads.map((payload) => payload.eventName)).toContain("nearby_results_loaded");
  expect(metricPayloads.map((payload) => payload.eventName)).toEqual(expect.arrayContaining([
    "address_search_started",
    "address_selected",
    "nearby_results_loaded",
  ]));
  for (const payload of metricPayloads) {
    expect(Object.keys(payload).sort()).toEqual(
      payload.durationMs === undefined ? ["eventName"] : ["durationMs", "eventName"],
    );
    expect(JSON.stringify(payload)).not.toMatch(/Rådhuspladsen|København|55\.6761|12\.5683|"(latitude|longitude|userId|url|query)"/i);
  }
});

test("gamle links renses straks for adresse og koordinater", async ({ page }) => {
  await mockNearby(page);

  await page.goto(
    "/shelters/nearby?lat=55.6761&lng=12.5683&q=Privat%20Testadresse%201",
  );

  await expect(page).toHaveURL((url) => url.pathname === "/shelters/nearby" && url.search === "");
  await expect(page.getByText("Søgeområde: Privat Testadresse 1")).toBeVisible();
  await expect(page.getByText("Rådhuspladsen 1", { exact: true })).toBeVisible();
});

test("direkte resultatlink uden fanesøgning forklarer privatlivsvalget", async ({ page }) => {
  await page.goto("/shelters/nearby");

  await expect(page.getByRole("heading", { name: "Start en ny søgning" })).toBeVisible();
  await expect(page.getByText(/adresse og position ikke i linket/)).toBeVisible();
});

test("mobilvisningen skifter mellem liste og kort", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "Mobilkontrol køres kun i mobilprojekterne.");
  const tileRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://tile.openstreetmap.org/")) tileRequests.push(request.url());
  });
  await installNearbySearchContext(page);
  await mockNearby(page);

  await page.goto("/shelters/nearby");
  const listTab = page.getByRole("tab", { name: "Liste" });
  const mapTab = page.getByRole("tab", { name: "Kort" });

  await expect(listTab).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => tileRequests.length).toBe(0);
  await page.getByRole("button", { name: "Vis på kort" }).click();
  await expect(mapTab).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => tileRequests.length).toBeGreaterThan(0);
  await expect(page.getByLabel("Valgt registrering")).toContainText("Rådhuspladsen 1");

  const mapTargets = page.locator(".nearby-map .leaflet-control-zoom a, .nearby-map .leaflet-marker-icon");
  await expect(mapTargets).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    const targetBox = await mapTargets.nth(index).boundingBox();
    expect(targetBox?.width).toBeGreaterThanOrEqual(44);
    expect(targetBox?.height).toBeGreaterThanOrEqual(44);
  }

  await page.getByRole("button", { name: "Luk oplysninger" }).click();
  await expect(page.getByLabel("Valgt registrering")).toBeHidden();
  await expect(mapTab).toBeFocused();
});

test("et vejnavn indsnævrer søgningen til et husnummer", async ({ page }) => {
  const searches: string[] = [];
  await mockAddressSearch(page);
  await page.unroute("https://adressevaelger.dk/husnumre/soeg**");
  await page.route("https://adressevaelger.dk/husnumre/soeg**", async (route) => {
    const text = new URL(route.request().url()).searchParams.get("tekst") ?? "";
    searches.push(text);
    // Mirrors the live API: "Vej , postnr by" lists the street's house numbers.
    const fund = text.includes(", 1550")
      ? [{ type: "husnummer", id: "0a3f507a-ec01-32b8-e044-0003ba298018", titel: selectedAddressLabel }]
      : [{
          type: "navngivenvejpostnummer",
          id: "83a1b9a3-185d-4596-ad9a-e7587dd14474",
          titel: "Rådhuspladsen 1550 København V",
          vejnavn: "Rådhuspladsen",
          postnr: "1550",
          postdistrikt: "København V",
        }];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", beskrivelse: "", fund }),
    });
  });

  await page.goto("/");
  const addressInput = page.getByRole("combobox", { name: "Adresse, by eller postnummer" });
  await addressInput.fill("Rådhusp");
  await page.getByRole("option", { name: "Rådhuspladsen 1550 København V" }).click();

  await expect(addressInput).toHaveValue("Rådhuspladsen , 1550 København V");
  await expect(addressInput).toBeFocused();
  expect(await addressInput.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(14);
  await page.getByRole("option", { name: selectedAddressLabel }).click();
  await expect(page.getByText(`Valgt adresse: ${selectedAddressLabel}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Søg", exact: true })).toBeEnabled();
  expect(searches).toContain("Rådhuspladsen , 1550 København V");
});

test("første resultat er synligt uden at scrolle, og kortet fylder skærmen", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "Layoutet kontrolleres i mobilprojekterne.");
  await installNearbySearchContext(page);
  await mockNearby(page);

  await page.goto("/shelters/nearby");
  const firstResult = page.locator("#nearby-list-panel article").first();
  await expect(firstResult).toBeVisible();
  const viewport = page.viewportSize();
  const heading = await firstResult.getByRole("heading").boundingBox();
  expect(viewport).not.toBeNull();
  expect(heading).not.toBeNull();
  expect(heading!.y + heading!.height).toBeLessThanOrEqual(viewport!.height);

  await page.getByRole("tab", { name: "Kort" }).click();
  await expect(page.locator(".nearby-map")).toBeVisible();
  await expect.poll(async () => {
    const map = await page.locator(".nearby-map").boundingBox();
    if (!map) return 0;
    const visibleTop = Math.max(map.y, 0);
    const visibleBottom = Math.min(map.y + map.height, viewport!.height);
    return (visibleBottom - visibleTop) / viewport!.height;
  }).toBeGreaterThanOrEqual(0.6);
});

test("resultater beregnes i browseren fra kortfliser uden at sende positionen", async ({ page }) => {
  await installNearbySearchContext(page);
  const nearbyRequests: string[] = [];
  const tileRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/app-v2/nearby/grouped") nearbyRequests.push(url.pathname);
  });
  // Registered after installNearbySearchContext, so it takes precedence over its server-search default.
  await page.route("**/api/app-v2/nearby/tiles/**", async (route) => {
    const tile = new URL(route.request().url()).pathname.split("/").pop()!;
    tileRequests.push(tile);
    const rows = tile === "222_31"
      ? Array.from({ length: 12 }, (_, index) => [
          `flise-${index}`, `Flisevej ${index + 1}`, "1550", "København V",
          55.6765 + index * 0.001, 12.5683, 100 + index, "320",
        ])
      : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ contract: "nearby-tile-v1", tile, revision: "rev:1", labels: { "320": "Kontor" }, rows }),
    });
  });

  await page.goto("/shelters/nearby");

  await expect(page.locator("#nearby-list-panel").getByText("Flisevej 1", { exact: true })).toBeVisible();
  await expect(page.locator("#nearby-list-panel article")).toHaveCount(10);
  // Dev mode mounts twice; compare the set of tiles.
  expect([...new Set(tileRequests)].sort()).toEqual(["221_30", "221_31", "221_32", "222_30", "222_31", "222_32", "223_30", "223_31", "223_32"]);
  expect(nearbyRequests).toHaveLength(0);
});
