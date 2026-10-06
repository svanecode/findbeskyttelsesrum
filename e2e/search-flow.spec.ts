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
  const addressInput = page.getByRole("combobox", { name: "Eller søg på en adresse" });
  await addressInput.fill("Rådhuspladsen 1");
  const nearbyRequestPromise = page.waitForRequest(
    (request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/app-v2/nearby/grouped",
  );
  // Choosing a suggestion searches at once.
  await page.getByRole("option", { name: selectedAddressLabel }).click();

  await expect(page).toHaveURL((url) => url.pathname === "/naer-dig" && url.search === "");
  const resultHeading = page.getByRole("heading", { name: "Nærmeste registrerede sikringsrum" });
  await expect(resultHeading).toBeVisible();
  // The page starts at the top with focus on the result heading.
  await expect(resultHeading).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByText("Rådhuspladsen 1", { exact: true })).toBeVisible();
  await expect(page.getByText(/120 pladser/)).toBeVisible();

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
    "/naer-dig?lat=55.6761&lng=12.5683&q=Privat%20Testadresse%201",
  );

  await expect(page).toHaveURL((url) => url.pathname === "/naer-dig" && url.search === "");
  await expect(page.getByText("Ved Privat Testadresse 1")).toBeVisible();
  await expect(page.getByText("Rådhuspladsen 1", { exact: true })).toBeVisible();
});

test("direkte resultatlink uden fanesøgning forklarer privatlivsvalget", async ({ page }) => {
  await page.goto("/naer-dig");

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

  await page.goto("/naer-dig");
  const listTab = page.getByRole("tab", { name: "Liste" });
  const mapTab = page.getByRole("tab", { name: "Kort" });

  await expect(listTab).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => tileRequests.length).toBe(0);
  await page.getByRole("button", { name: /^Vis .* på kort$/ }).click();
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
  const addressInput = page.getByRole("combobox", { name: "Eller søg på en adresse" });
  await addressInput.fill("Rådhusp");
  await page.getByRole("option", { name: "Rådhuspladsen 1550 København V" }).click();

  await expect(addressInput).toHaveValue("Rådhuspladsen , 1550 København V");
  await expect(addressInput).toBeFocused();
  expect(await addressInput.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(14);
  await expect(page.getByRole("option", { name: selectedAddressLabel })).toBeVisible();
  expect(searches).toContain("Rådhuspladsen , 1550 København V");
  await page.getByRole("option", { name: selectedAddressLabel }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/naer-dig");
});

test("første resultat er synligt uden at scrolle, og kortet fylder skærmen", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "Layoutet kontrolleres i mobilprojekterne.");
  await installNearbySearchContext(page);
  await mockNearby(page);

  await page.goto("/naer-dig");
  const firstResult = page.locator("#nearby-list-panel ol > li").first();
  await expect(firstResult).toBeVisible();
  const viewport = page.viewportSize();
  const heading = await firstResult.getByRole("link").first().boundingBox();
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
      body: JSON.stringify({ contract: "nearby-tile-v1", tile, revision: "publication:1", labels: { "320": "Kontor" }, rows }),
    });
  });

  await page.goto("/naer-dig");

  await expect(page.locator("#nearby-list-panel").getByText("Flisevej 1", { exact: true })).toBeVisible();
  await expect(page.locator("#nearby-list-panel ol > li")).toHaveCount(10);
  // Dev mode mounts twice; compare the set of tiles.
  expect([...new Set(tileRequests)].sort()).toEqual(["221_30", "221_31", "221_32", "222_30", "222_31", "222_32", "223_30", "223_31", "223_32"]);
  expect(nearbyRequests).toHaveLength(0);
});

test("fliser fra før en publicering hentes igen i den nye version i stedet for at sende positionen", async ({ page }) => {
  await installNearbySearchContext(page);
  const nearbyRequests: string[] = [];
  const pinnedRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/app-v2/nearby/grouped") nearbyRequests.push(url.pathname);
  });
  // The CDN still holds 222_31 and 222_32 from revision 4; the rest are already at revision 5.
  await page.route("**/api/app-v2/nearby/tiles/**", async (route) => {
    const segments = new URL(route.request().url()).pathname.split("/").slice(5);
    const [tile, pinned] = segments as [string, string | undefined];
    if (pinned) pinnedRequests.push(`${tile}/${pinned}`);
    const stale = !pinned && (tile === "222_31" || tile === "222_32");
    const rows = tile === "222_31"
      ? Array.from({ length: 12 }, (_, index) => [
          `flise-${index}`, `${stale ? "Gammelvej" : "Flisevej"} ${index + 1}`, "1550", "København V",
          55.6765 + index * 0.001, 12.5683, 100 + index, "320",
        ])
      : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contract: "nearby-tile-v1", tile, revision: stale ? "publication-a:4" : "publication-b:5",
        labels: { "320": "Kontor" }, rows,
      }),
    });
  });

  await page.goto("/naer-dig");

  await expect(page.locator("#nearby-list-panel").getByText("Flisevej 1", { exact: true })).toBeVisible();
  await expect(page.locator("#nearby-list-panel").getByText("Gammelvej 1", { exact: true })).toHaveCount(0);
  expect([...new Set(pinnedRequests)].sort()).toEqual(["222_31/5", "222_32/5"]);
  expect(nearbyRequests).toHaveLength(0);
});

test("Enter og Søg gør det samme: ét entydigt match søges straks", async ({ page }) => {
  await mockAddressSearch(page);
  await mockNearby(page);

  for (const submit of ["Enter", "click"] as const) {
    await page.goto("/");
    const addressInput = page.getByRole("combobox", { name: "Eller søg på en adresse" });
    const searchButton = page.getByRole("button", { name: "Søg", exact: true });
    await expect(searchButton).toBeEnabled();
    await addressInput.fill("Rådhuspladsen 1, 1550");
    if (submit === "Enter") await addressInput.press("Enter");
    else await searchButton.click();
    await expect(page).toHaveURL((url) => url.pathname === "/naer-dig");
    await expect(page.getByText("Ved " + selectedAddressLabel)).toBeVisible();
  }
});

test("tvetydig fritekst viser forslag med en instruktion, der annonceres", async ({ page }) => {
  await mockAddressSearch(page, [
    { type: "husnummer", id: "0a3f507a-ec01-32b8-e044-0003ba298018", titel: "Rådhuspladsen 1, 1550 København V" },
    { type: "husnummer", id: "0a3f5096-c91e-32b8-e044-0003ba298018", titel: "Rådhuspladsen 1, 8000 Aarhus C" },
  ]);
  await mockNearby(page);

  await page.goto("/");
  const addressInput = page.getByRole("combobox", { name: "Eller søg på en adresse" });
  await addressInput.fill("Rådhuspladsen 1");
  await addressInput.press("Escape");
  await page.getByRole("button", { name: "Søg", exact: true }).click();

  // Announced by the status region and shown over the list (2.2).
  await expect(page.getByRole("status").filter({ hasText: "Vælg den rigtige adresse på listen." })).toHaveCount(1);
  await expect(page.locator("p[aria-hidden='true']", { hasText: "Vælg den rigtige adresse på listen." })).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(2);
  await expect(page).toHaveURL((url) => url.pathname === "/");

  // The list works with the arrow keys and Escape, and Enter on a suggestion searches at once.
  await addressInput.press("ArrowDown");
  await addressInput.press("ArrowDown");
  await addressInput.press("ArrowUp");
  await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await addressInput.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await addressInput.press("ArrowDown");
  await addressInput.press("Enter");
  await expect(page).toHaveURL((url) => url.pathname === "/naer-dig");

  // Back on the front page the chosen address is still in the field, ready to correct.
  await page.goBack();
  await expect(page.getByRole("combobox", { name: "Eller søg på en adresse" })).toHaveValue("Rådhuspladsen 1, 1550 København V");
});

test("tom søgning giver en fejltekst ved feltet i stedet for en deaktiveret knap", async ({ page }) => {
  await page.goto("/");
  const searchButton = page.getByRole("button", { name: "Søg", exact: true });
  await expect(searchButton).toBeEnabled();
  await searchButton.click();
  await expect(page.getByText("Skriv en adresse, et postnummer eller en by.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Eller søg på en adresse" })).toBeFocused();
});
