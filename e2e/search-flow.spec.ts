import { expect, test } from "@playwright/test";

import {
  installNearbySearchContext,
  isolateRateLimit,
  mockDawa,
  mockNearby,
  quietThirdPartyRequests,
  selectedAddressLabel,
} from "./support";

test.beforeEach(async ({ page }, testInfo) => {
  await isolateRateLimit(page, testInfo);
  await quietThirdPartyRequests(page);
});

test("adresseflowet viser resultater uden steddata i URL'en", async ({ page }) => {
  await mockDawa(page);
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
  expect(nearbyRequest.postDataJSON()).toEqual({
    lat: 55.6761,
    lng: 12.5683,
    limit: 10,
  });
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
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobilkontrol køres kun i mobilprojektet.");
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
  await page.getByRole("button", { name: "Til listen" }).click();
  await expect(listTab).toHaveAttribute("aria-selected", "true");
});
