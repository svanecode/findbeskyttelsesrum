import type { Page, TestInfo } from "@playwright/test";

export const knownShelterSlug = "kobenhavn-radhuspladsen-14-e317aa299d35";
export const selectedAddressLabel = "Rådhuspladsen 1, 1550 København V";

export const nearbyResponse = {
  results: [
    {
      groupKey: "raadhuspladsen-1-1550",
      address: {
        line1: "Rådhuspladsen 1",
        postalCode: "1550",
        city: "København V",
      },
      coordinates: {
        latitude: 55.6761,
        longitude: 12.5683,
      },
      distanceMeters: 825,
      shelterCount: 1,
      totalCapacity: 120,
      applicationCodeLabel: "Bygning til kontor",
      municipality: {
        id: "8f4a4b9f-fbc8-4c5c-9b1c-4b344f4f7401",
        code: "0101",
        name: "København",
        slug: "kobenhavn",
      },
      representativeShelter: {
        id: "7c10b51d-d5f0-42fd-9f36-640958f85e29",
        slug: knownShelterSlug,
        name: "Rådhuspladsen 1",
        capacity: 120,
      },
      shelters: [
        {
          id: "7c10b51d-d5f0-42fd-9f36-640958f85e29",
          slug: knownShelterSlug,
          name: "Rådhuspladsen 1",
          capacity: 120,
        },
      ],
      shelterIds: ["7c10b51d-d5f0-42fd-9f36-640958f85e29"],
      shelterSlugs: [knownShelterSlug],
    },
  ],
  meta: {
    contract: "app_v2_nearby_grouped_v1",
    source: "app_v2",
    resultCount: 1,
  },
};

export async function isolateRateLimit(page: Page, testInfo: TestInfo) {
  const testKey = testInfo.testId.replace(/[^a-z0-9-]/gi, "-").slice(0, 180);
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `e2e-${testKey}`,
  });
}

export async function quietThirdPartyRequests(page: Page) {
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/errors", async (route) => {
    await route.fulfill({ status: 204 });
  });
}

export async function mockDawa(page: Page, response?: unknown[]) {
  const suggestions = response ?? [
    {
      tekst: selectedAddressLabel,
      forslagstekst: selectedAddressLabel,
      type: "adresse",
      caretpos: selectedAddressLabel.length,
      data: {
        x: 12.5683,
        y: 55.6761,
        href: "https://api.dataforsyningen.dk/adresser/mock-raadhuspladsen-1",
      },
    },
  ];

  await page.route("https://api.dataforsyningen.dk/autocomplete**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(suggestions),
    });
  });
}

export async function mockNearby(page: Page, status = 200, body: unknown = nearbyResponse) {
  await page.route("**/api/app-v2/nearby/grouped", async (route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

export async function installNearbySearchContext(
  page: Page,
  input: { latitude?: number; longitude?: number; label?: string } = {},
) {
  const value = {
    version: 1,
    latitude: input.latitude ?? 55.6761,
    longitude: input.longitude ?? 12.5683,
    label: input.label ?? selectedAddressLabel,
    createdAt: Date.now(),
  };

  await page.addInitScript((context) => {
    try {
      window.sessionStorage.setItem("findbeskyttelsesrum.nearby-search.v1", JSON.stringify(context));
    } catch {
      // The initial about:blank document has an opaque origin. The script runs again on the app origin.
    }
  }, value);
}
