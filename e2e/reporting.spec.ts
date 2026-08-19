import { expect, test } from "@playwright/test";

import { isolateRateLimit, knownShelterSlug, quietThirdPartyRequests } from "./support";

test.beforeEach(async ({ page }, testInfo) => {
  await isolateRateLimit(page, testInfo);
  await quietThirdPartyRequests(page);
});

test("fejlrapportering ender i moderationskø uden en rigtig skrivning", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Rapportflowet behøver kun én browserprofil.");
  let submittedPayload: Record<string, unknown> | null = null;

  await page.route("**/api/app-v2/shelter-reports", async (route) => {
    submittedPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  await page.goto(`/beskyttelsesrum/${knownShelterSlug}`);
  await page.getByRole("button", { name: "Rapportér fejl ved registreringen" }).click();
  await page.getByLabel("Hvad ser forkert ud?").selectOption("incorrect_capacity");
  await page.getByLabel("Beskriv det, du har observeret").fill("Kapaciteten på registreringen ser forkert ud.");
  await page.getByRole("button", { name: "Send rapport" }).click();

  await expect(page.getByRole("status")).toContainText("Tak for din rapport");
  expect(submittedPayload).toMatchObject({
    reportType: "incorrect_capacity",
    message: "Kapaciteten på registreringen ser forkert ud.",
  });
});

test("rapporterings-API afviser ugyldige data uden databaseskrivning", async ({ request }) => {
  const response = await request.post("/api/app-v2/shelter-reports", {
    headers: {
      "x-forwarded-for": "e2e-reporting-api-validation",
    },
    data: {
      shelterId: "ikke-et-uuid",
      reportType: "resolved",
      message: "Denne tekst er lang nok.",
    },
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: "Registreringen eller fejltypen er ugyldig.",
  });
});
